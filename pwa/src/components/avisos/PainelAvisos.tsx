'use client';

import { useCallback, useEffect, useState } from 'react';

import { Carregando } from '@/components/Carregando';
import { dataEHora } from '@/lib/datas';

type Diagnostico = {
  seguro: boolean;
  suportaPush: boolean;
  ios: boolean;
  instalado: boolean;
  navegadorDeApp: boolean;
  permissao: NotificationPermission | 'indisponivel';
  inscrito: boolean;
};

type Aviso = {
  id: string;
  rotulo: string;
  detalhe: string;
  estado: string;
  enviadaEm: string | null;
  criadaEm: string;
  recebida: boolean;
  exibida: boolean;
  aberta: boolean;
};

type ResultadoTeste = {
  id: string;
  estado: string;
  motivo: string | null;
  aparelhos: { resultado: string; codigo: number | null }[];
};

function base64UrlParaBytes(texto: string): Uint8Array<ArrayBuffer> {
  const preenchido = texto + '='.repeat((4 - (texto.length % 4)) % 4);
  const bruto = atob(preenchido.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bruto, (caractere) => caractere.charCodeAt(0));
}

/** Promessa com prazo: sem ele, uma etapa que não responde deixa a tela esperando para sempre. */
function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promessa,
    new Promise<T>((_, rejeitar) => setTimeout(() => rejeitar(new Error('sem resposta')), ms)),
  ]);
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * O que aconteceu com o aviso de teste neste aparelho, pelos recibos dele.
 *
 * LÓGICA DO LUCIANO: "o serviço aceitou" era tudo o que a tela sabia dizer, e
 * não quer dizer que o aviso chegou. São três falhas diferentes, cada uma com um
 * conserto diferente, e quem está com o celular na mão precisa saber qual é a
 * dele.
 */
function veredito(aviso: Aviso | undefined): { texto: string; erro: boolean } {
  if (aviso?.exibida) {
    return { texto: 'Chegou e apareceu neste aparelho. Os avisos estão funcionando.', erro: false };
  }
  if (aviso?.recebida) {
    return {
      texto:
        'O aviso chegou ao aparelho, mas o celular não mostrou. Nas configurações do celular, em Apps, Chrome, Notificações, confira se as notificações deste site estão permitidas.',
      erro: true,
    };
  }
  return {
    texto:
      'O serviço de avisos aceitou, mas o aparelho não confirmou que recebeu. Com esta tela aberta ele costuma chegar na hora. Se não chegou, o celular pode estar segurando o Chrome em segundo plano: em Configurações, Bateria, deixe o Chrome sem restrição.',
    erro: true,
  };
}

/**
 * O registro do service worker do staging, já ativo.
 *
 * LÓGICA DO LUCIANO: aqui estava `navigator.serviceWorker.ready`, e era por isso
 * que os avisos não apareciam. O `ready` devolve o service worker que controla a
 * página naquele momento, e o do chat `/` tem escopo no site inteiro: numa
 * página do staging aberta antes de o service worker dela assumir, o `ready`
 * devolvia o do `/`. A inscrição ia para ele, que não tem código de aviso, e o
 * Chrome mostrava no lugar o genérico "Este site foi atualizado em segundo
 * plano". O Google aceitava todos os envios, e nada aparecia.
 *
 * Agora a inscrição vai sempre para o registro que o próprio `register`
 * devolve, esperando ele ficar ativo, que é quando o push pode ser pedido.
 */
async function registroDoStaging(): Promise<ServiceWorkerRegistration> {
  const registro = await navigator.serviceWorker.register('/staging/sw.js', { scope: '/staging/' });
  const chegando = registro.installing ?? registro.waiting;
  if (!registro.active && chegando) {
    await new Promise<void>((pronto) => {
      chegando.addEventListener('statechange', () => {
        if (chegando.state === 'activated') pronto();
      });
    });
  }
  return registro;
}

/**
 * Leva para o lugar certo a inscrição que ficou no service worker do `/`.
 *
 * Quem ativou os avisos antes da correção acima tem a inscrição presa lá, e
 * continuaria recebendo só o aviso genérico do Chrome. Com a permissão já dada,
 * a inscrição nova não precisa de toque, então a troca é feita sozinha ao abrir
 * esta tela: inscreve no staging, avisa o servidor, e só então desfaz a antiga.
 * Devolve se trocou alguma coisa.
 */
async function corrigirInscricaoForaDoLugar(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;

  const doChat = await navigator.serviceWorker.getRegistration('/');
  if (!doChat || new URL(doChat.scope).pathname !== '/') return false;
  const antiga = await doChat.pushManager.getSubscription();
  if (!antiga) return false;

  if (Notification.permission === 'granted') {
    const registro = await comPrazo(registroDoStaging(), 15_000);
    const { chavePublica } = (await (await fetch('/api/push/chave-publica')).json()) as {
      chavePublica: string;
    };
    const nova = await comPrazo(
      registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlParaBytes(chavePublica),
      }),
      20_000,
    );
    const gravou = await fetch('/api/push/inscricoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nova.toJSON()),
    });
    // Sem a nova gravada, a antiga fica: um aviso genérico ainda é melhor que nenhum.
    if (!gravou.ok) return false;
  }

  await fetch('/api/push/inscricoes', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: antiga.endpoint }),
  });
  await antiga.unsubscribe();
  return true;
}

async function diagnosticar(): Promise<Diagnostico> {
  const agente = navigator.userAgent;
  const suportaPush =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  let inscrito = false;
  if (suportaPush && window.isSecureContext) {
    try {
      const registro = await navigator.serviceWorker.getRegistration('/staging/');
      // `getRegistration` devolve o registro mais específico que cobre o
      // endereço, e sem o do staging cai no do `/`. Inscrição lá não recebe
      // aviso, então não conta como ativa.
      const doStaging = registro && new URL(registro.scope).pathname === '/staging/';
      inscrito = Boolean(doStaging && (await registro.pushManager.getSubscription()));
    } catch {
      inscrito = false;
    }
  }

  return {
    seguro: window.isSecureContext,
    suportaPush,
    // iPad novo se apresenta como Mac; o que o denuncia é a tela de toque.
    ios: /iPad|iPhone|iPod/.test(agente) || (/Macintosh/.test(agente) && navigator.maxTouchPoints > 1),
    instalado:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    // Instagram, Facebook e WebView do Android: nenhum deles entrega push.
    navegadorDeApp: /FBAN|FBAV|Instagram|Line\/|; wv\)/.test(agente),
    permissao: 'Notification' in window ? Notification.permission : 'indisponivel',
    inscrito,
  };
}

/**
 * O que impede este aparelho de receber avisos, dito para quem vai resolver.
 *
 * LÓGICA DO LUCIANO: cada item desta lista é um limite do push na web, e a
 * validação existe para medir quantas pessoas esbarram em cada um. A ordem é a
 * de qual resolver primeiro — de nada adianta pedir permissão num iPhone que
 * ainda não instalou o app, porque lá o pedido nem aparece.
 */
function impedimento(diagnostico: Diagnostico): string | null {
  if (diagnostico.navegadorDeApp) {
    return 'Você está no navegador de outro aplicativo (Instagram, Facebook…). Abra este endereço no Chrome ou no Safari.';
  }
  if (!diagnostico.seguro) {
    return 'Avisos só funcionam em conexão segura. Abra pelo endereço que começa com https.';
  }
  if (diagnostico.ios && !diagnostico.instalado) {
    return 'No iPhone, os avisos só funcionam com o app na Tela de Início: toque em Compartilhar, depois em "Adicionar à Tela de Início", e abra por lá.';
  }
  if (!diagnostico.suportaPush) {
    return 'Este navegador não recebe avisos. Tente pelo Chrome, no Android, ou pelo Safari, no iPhone.';
  }
  if (diagnostico.permissao === 'denied') {
    return 'Os avisos foram bloqueados para este site. Para liberar, abra as configurações do navegador, entre em Permissões do site e permita Notificações.';
  }
  return null;
}

export function PainelAvisos() {
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  // Três estados, e não uma lista que começa vazia: "Nenhum aviso ainda." antes
  // de a resposta chegar diz que não existe nada, e é mentira.
  const [lista, setLista] = useState<'carregando' | 'pronta' | 'falhou'>('carregando');
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);

  const carregarAvisos = useCallback(async () => {
    try {
      const resposta = await fetch('/api/notificacoes');
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      setAvisos(((await resposta.json()) as { avisos: Aviso[] }).avisos);
      setLista('pronta');
    } catch {
      // Numa atualização depois de uma ação, a lista que já estava na tela
      // continua valendo: trocá-la por erro apagaria o que a pessoa já via.
      setLista((atual) => (atual === 'pronta' ? atual : 'falhou'));
    }
  }, []);

  // Em paralelo: a lista vem da rede e o diagnóstico é local, e esperar um pelo
  // outro só atrasava a lista.
  const atualizar = useCallback(async () => {
    await Promise.all([diagnosticar().then(setDiagnostico), carregarAvisos()]);
  }, [carregarAvisos]);

  // Uma vez por abertura da tela, antes do diagnóstico que a pessoa vai ler.
  useEffect(() => {
    void (async () => {
      try {
        if (await corrigirInscricaoForaDoLugar()) {
          setMensagem({
            texto: 'Ajustei os avisos deste aparelho. Toque em "Enviar um teste para mim" para conferir.',
            erro: false,
          });
          setDiagnostico(await diagnosticar());
        }
      } catch {
        // Sem conseguir corrigir agora, a tela segue igual; tenta de novo na próxima abertura.
      }
    })();
  }, []);

  useEffect(() => {
    void atualizar();
  }, [atualizar]);

  async function ativar() {
    setOcupado(true);
    setMensagem(null);
    try {
      // Tem de vir de um toque: navegadores recusam pedido de permissão que não
      // nasceu de um gesto da pessoa.
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        setMensagem({ texto: 'Os avisos não foram permitidos neste aparelho.', erro: true });
        return;
      }

      const registro = await registroDoStaging();
      const { chavePublica } = (await (await fetch('/api/push/chave-publica')).json()) as {
        chavePublica: string;
      };
      // O serviço de push do navegador às vezes não responde (rede ruim, Chrome
      // sem acesso ao Google); sem prazo, o botão ficava em "Ativando…" para sempre.
      const inscricao = await comPrazo(
        registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlParaBytes(chavePublica),
        }),
        20_000,
      );

      const resposta = await fetch('/api/push/inscricoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inscricao.toJSON()),
      });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

      setMensagem({ texto: 'Avisos ativados neste aparelho.', erro: false });
    } catch {
      setMensagem({ texto: 'Não consegui ativar os avisos. Tente de novo em instantes.', erro: true });
    } finally {
      setOcupado(false);
      void atualizar();
    }
  }

  async function desativar() {
    setOcupado(true);
    setMensagem(null);
    try {
      const registro = await navigator.serviceWorker.getRegistration('/staging/');
      const inscricao = await registro?.pushManager.getSubscription();
      if (inscricao) {
        await fetch('/api/push/inscricoes', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        });
        await inscricao.unsubscribe();
      }
      setMensagem({ texto: 'Avisos desativados neste aparelho.', erro: false });
    } finally {
      setOcupado(false);
      void atualizar();
    }
  }

  async function testar() {
    setOcupado(true);
    setMensagem(null);
    try {
      const resposta = await fetch('/api/notificacoes/teste', { method: 'POST' });
      const dados = (await resposta.json()) as ResultadoTeste & { erro?: string };
      if (!resposta.ok) {
        setMensagem({ texto: dados.erro ?? 'Não consegui enviar o teste.', erro: true });
        return;
      }

      if (dados.estado === 'enviada') {
        // Enquanto espera, quem fala é o sinal de carregamento embaixo dos botões.
        setMensagem(await acompanharTeste(dados.id));
      } else if (dados.aparelhos.length === 0) {
        setMensagem({ texto: 'Nenhum aparelho com avisos ativos nesta conta.', erro: true });
      } else {
        const codigos = dados.aparelhos.map((a) => a.codigo ?? 'sem resposta').join(', ');
        setMensagem({ texto: `O envio não foi aceito (${codigos}). Tente desativar e ativar de novo.`, erro: true });
      }
    } catch {
      setMensagem({ texto: 'Sem conexão com o servidor.', erro: true });
    } finally {
      setOcupado(false);
      void atualizar();
    }
  }

  /** Espera os recibos do aviso de teste por até 20 segundos. */
  async function acompanharTeste(id: string) {
    let aviso: Aviso | undefined;
    for (let tentativa = 0; tentativa < 10; tentativa += 1) {
      await esperar(2000);
      try {
        const resposta = await fetch('/api/notificacoes');
        if (!resposta.ok) continue;
        const lista = ((await resposta.json()) as { avisos: Aviso[] }).avisos;
        setAvisos(lista);
        aviso = lista.find((item) => item.id === id);
        if (aviso?.exibida) break;
      } catch {
        // Rede oscilando: a próxima volta tenta de novo.
      }
    }
    return veredito(aviso);
  }

  /**
   * Mostra uma notificação direto daqui, sem servidor e sem serviço de push.
   *
   * Separa as duas metades do problema: se esta não aparece, o celular bloqueia
   * notificações; se esta aparece e o teste pelo servidor não, o problema é a
   * entrega.
   */
  async function testarTela() {
    setMensagem(null);
    try {
      const registro = await comPrazo(registroDoStaging(), 10_000);
      await registro.showNotification('Teste deste aparelho', {
        body: 'Se você está vendo isto, este celular mostra notificações.',
        icon: '/icons/icone-192.png',
        tag: 'teste-local',
      });
      setMensagem({
        texto:
          'Pedi uma notificação direto a este aparelho. Se ela não apareceu, as notificações do Chrome estão bloqueadas nas configurações do celular.',
        erro: false,
      });
    } catch {
      setMensagem({
        texto: 'Este aparelho não deixou mostrar a notificação. Confira a permissão de notificações do site.',
        erro: true,
      });
    }
  }

  if (!diagnostico) return <Carregando texto="Verificando este aparelho…" />;

  const bloqueio = impedimento(diagnostico);

  return (
    <>
      <section className="st-cartao">
        <h2>Neste aparelho</h2>

        <ul className="st-diagnostico">
          <li className={diagnostico.seguro ? 'st-ok' : 'st-falta'}>Conexão segura</li>
          <li className={diagnostico.suportaPush && !diagnostico.navegadorDeApp ? 'st-ok' : 'st-falta'}>
            Navegador recebe avisos
          </li>
          {diagnostico.ios && (
            <li className={diagnostico.instalado ? 'st-ok' : 'st-falta'}>App na Tela de Início</li>
          )}
          <li className={diagnostico.permissao === 'granted' ? 'st-ok' : 'st-falta'}>Permissão dada</li>
          <li className={diagnostico.inscrito ? 'st-ok' : 'st-falta'}>Avisos ativos</li>
        </ul>

        {bloqueio && (
          <p className="st-orientacao" role="note">
            {bloqueio}
          </p>
        )}

        {mensagem && (
          <p className={mensagem.erro ? 'st-erro' : 'st-aviso-ok'} role={mensagem.erro ? 'alert' : 'status'}>
            {mensagem.texto}
          </p>
        )}

        {diagnostico.inscrito ? (
          <>
            <div className="st-acoes">
              <button type="button" className="st-botao st-botao-secundario" onClick={desativar} disabled={ocupado}>
                Desativar
              </button>
              <button type="button" className="st-botao" onClick={testar} disabled={ocupado}>
                {ocupado ? 'Testando…' : 'Enviar um teste para mim'}
              </button>
            </div>
            {ocupado && <Carregando texto="Esperando o aparelho confirmar…" variante="linha" />}
            <button type="button" className="st-link-acao" onClick={testarTela} disabled={ocupado}>
              O teste não aparece? Testar só a tela deste aparelho
            </button>
          </>
        ) : (
          <button type="button" className="st-botao" onClick={ativar} disabled={ocupado || Boolean(bloqueio)}>
            {ocupado ? 'Ativando…' : 'Ativar avisos neste aparelho'}
          </button>
        )}
      </section>

      <section className="st-cartao">
        <h2>Avisos recebidos</h2>
        {lista === 'carregando' ? (
          <Carregando texto="Buscando seus avisos…" variante="linha" />
        ) : lista === 'falhou' ? (
          <>
            <p className="st-erro" role="alert">
              Não consegui buscar seus avisos agora. Confira a internet e tente de novo.
            </p>
            <button
              type="button"
              className="st-botao st-botao-secundario"
              onClick={() => {
                setLista('carregando');
                void carregarAvisos();
              }}
            >
              Tentar de novo
            </button>
          </>
        ) : avisos.length === 0 ? (
          <p className="st-dica">
            Nenhum aviso ainda. Quando a equipe de saúde mandar um lembrete, ele aparece aqui.
          </p>
        ) : (
          <ul className="st-lista-conversas">
            {avisos.map((aviso) => (
              <li key={aviso.id}>
                <a href={`/staging/avisos/${aviso.id}`}>
                  <span className="st-conversa-pergunta">{aviso.rotulo}</span>
                  <span className="st-dica">
                    {dataEHora(aviso.enviadaEm ?? aviso.criadaEm)}
                    {aviso.estado !== 'enviada'
                      ? ` · ${aviso.estado}`
                      : aviso.aberta
                        ? ' · aberto'
                        : aviso.exibida
                          ? ' · apareceu no aparelho'
                          : aviso.recebida
                            ? ' · chegou, mas não apareceu'
                            : ' · sem confirmação do aparelho'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
