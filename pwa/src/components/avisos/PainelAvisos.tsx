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
  aberta: boolean;
};

type ResultadoTeste = {
  estado: string;
  motivo: string | null;
  aparelhos: { resultado: string; codigo: number | null }[];
};

function base64UrlParaBytes(texto: string): Uint8Array<ArrayBuffer> {
  const preenchido = texto + '='.repeat((4 - (texto.length % 4)) % 4);
  const bruto = atob(preenchido.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bruto, (caractere) => caractere.charCodeAt(0));
}

async function registroDoStaging(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/staging/sw.js', { scope: '/staging/' });
  // `ready` só resolve com o service worker ATIVO — inscrever antes disso falha
  // na primeira visita, enquanto ele ainda está instalando.
  return navigator.serviceWorker.ready;
}

async function diagnosticar(): Promise<Diagnostico> {
  const agente = navigator.userAgent;
  const suportaPush =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  let inscrito = false;
  if (suportaPush && window.isSecureContext) {
    try {
      const registro = await navigator.serviceWorker.getRegistration('/staging/');
      inscrito = Boolean(await registro?.pushManager.getSubscription());
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
      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlParaBytes(chavePublica),
      });

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
        setMensagem({ texto: 'Teste enviado. Ele deve aparecer em alguns segundos.', erro: false });
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
          <div className="st-acoes">
            <button type="button" className="st-botao st-botao-secundario" onClick={desativar} disabled={ocupado}>
              Desativar
            </button>
            <button type="button" className="st-botao" onClick={testar} disabled={ocupado}>
              {ocupado ? 'Enviando…' : 'Enviar um teste para mim'}
            </button>
          </div>
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
                    {aviso.estado !== 'enviada' ? ` · ${aviso.estado}` : aviso.aberta ? ' · aberto' : ''}
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
