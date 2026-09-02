import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FlaskConical, History, RotateCcw, Save, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  ativarScript,
  getScriptAtivo,
  listScripts,
  restaurarScriptPadrao,
  salvarScript,
} from "@/lib/import-scripts.functions";
import { ErroDeScript, rodarScript, type EntradaScript, type SaidaScript } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ModeloBotoes } from "@/components/modelo-botoes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const EXEMPLO_WORD = [
  "[ASSUNTO: Exames]",
  "P: Preciso de jejum para o exame de sangue?",
  "R: Sim. O jejum recomendado e de 8 horas. Agua pode.",
  "TAGS: jejum, sangue, coleta. FONTE: Cartilha do Ministerio da Saude, 2024.",
].join("\n");

const EXEMPLO_PLANILHA = [
  "Pergunta\tResposta\tAssunto\tTags\tFonte",
  "Preciso de jejum?\tSim, 8 horas.\texames\tjejum, sangue, coleta\tCartilha MS",
].join("\n");

/**
 * Converte o texto colado no painel de teste na entrada que o script espera.
 *
 * Colar direto do Excel produz colunas separadas por TAB — é por isso que a
 * planilha é lida assim, e não por vírgula: quem está testando cola a seleção
 * da planilha real, não digita CSV à mão.
 */
function montarEntrada(tipo: "docx" | "xlsx", texto: string): EntradaScript {
  const linhas = texto.split("\n");

  if (tipo === "docx") {
    return {
      tipo,
      nomeArquivo: "teste.docx",
      paragrafos: linhas.map((l) => l.trim()).filter(Boolean),
    };
  }

  const preenchidas = linhas.filter((l) => l.trim() !== "");
  if (preenchidas.length === 0) return { tipo, nomeArquivo: "teste.xlsx", linhas: [] };

  const cabecalho = preenchidas[0].split("\t").map((c) => c.trim());
  return {
    tipo,
    nomeArquivo: "teste.xlsx",
    linhas: preenchidas.slice(1).map((linha) => {
      const celulas = linha.split("\t");
      const objeto: Record<string, string> = {};
      cabecalho.forEach((nome, i) => {
        objeto[nome] = (celulas[i] ?? "").trim();
      });
      return objeto;
    }),
  };
}

function PainelTeste({ codigo }: { codigo: string }) {
  const [tipo, setTipo] = useState<"docx" | "xlsx">("docx");
  const [amostra, setAmostra] = useState(EXEMPLO_WORD);
  const [saida, setSaida] = useState<SaidaScript | null>(null);
  const [erro, setErro] = useState<{ mensagem: string; detalhe?: string } | null>(null);
  const [rodando, setRodando] = useState(false);

  const trocarTipo = (novo: "docx" | "xlsx") => {
    setTipo(novo);
    setAmostra(novo === "docx" ? EXEMPLO_WORD : EXEMPLO_PLANILHA);
    setSaida(null);
    setErro(null);
  };

  const testar = async () => {
    setRodando(true);
    setErro(null);
    setSaida(null);
    try {
      setSaida(await rodarScript(codigo, montarEntrada(tipo, amostra)));
    } catch (e) {
      // ErroDeScript carrega `detalhe` com a pilha de dentro do worker — e o
      // que aponta a linha do script que quebrou.
      const erroDoScript = e instanceof ErroDeScript ? e : null;
      setErro({
        mensagem: e instanceof Error ? e.message : String(e),
        detalhe: erroDoScript?.detalhe,
      });
    } finally {
      setRodando(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <FlaskConical className="size-4" /> Testar antes de salvar
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Roda o script de verdade, no mesmo ambiente isolado que a importacao usa. E aqui que se ve o
        resultado antes de ele valer para todo mundo.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={tipo === "docx" ? "default" : "outline"}
          onClick={() => trocarTipo("docx")}
        >
          Paragrafos do Word
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tipo === "xlsx" ? "default" : "outline"}
          onClick={() => trocarTipo("xlsx")}
        >
          Linhas da planilha
        </Button>
      </div>

      <Textarea
        value={amostra}
        onChange={(e) => setAmostra(e.target.value)}
        rows={6}
        spellCheck={false}
        className="mt-3 font-mono text-xs"
        aria-label="Amostra para teste"
      />
      {tipo === "xlsx" && (
        <p className="mt-1 text-xs text-muted-foreground">
          Cole direto do Excel: as colunas vem separadas por tabulacao. A primeira linha e o
          cabecalho.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={rodando}
        onClick={() => void testar()}
      >
        {rodando ? "Rodando…" : "Rodar"}
      </Button>

      {erro && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">{erro.mensagem}</p>
          {erro.detalhe && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {erro.detalhe}
            </pre>
          )}
        </div>
      )}

      {saida && (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-medium">
            {saida.faqs.length} FAQ(s) e {saida.avisos.length} aviso(s)
          </p>

          {saida.faqs.map((faq, i) => (
            <div key={i} className="rounded-lg border border-border p-3 text-sm">
              <p className="text-xs text-muted-foreground">
                linha {faq.linha} · assunto: {faq.category || "(vazio)"}
              </p>
              <p className="mt-1 font-medium break-words">{faq.question}</p>
              <p className="mt-1 break-words text-muted-foreground">{faq.answer}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                tags: {faq.tags?.join(", ") || "(nenhuma)"} · fonte: {faq.source || "(vazia)"}
              </p>
            </div>
          ))}

          {saida.avisos.map((aviso, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              <AlertTriangle className="mr-1 inline size-3" />
              linha {aviso.linha}: {aviso.mensagem}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScriptEditor() {
  const queryClient = useQueryClient();
  const inputArquivo = useRef<HTMLInputElement>(null);

  const salvar = useServerFn(salvarScript);
  const ativar = useServerFn(ativarScript);
  const restaurar = useServerFn(restaurarScriptPadrao);

  const ativo = useQuery({ queryKey: ["script-ativo"], queryFn: () => getScriptAtivo() });
  const versoes = useQuery({ queryKey: ["scripts"], queryFn: () => listScripts() });

  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [notas, setNotas] = useState("");
  const [confirmandoRestauro, setConfirmandoRestauro] = useState(false);

  // Só preenche o editor na primeira carga: recarregar por trás enquanto a
  // pessoa digita apagaria o que ela escreveu.
  const carregado = useRef(false);
  useEffect(() => {
    if (carregado.current || !ativo.data) return;
    carregado.current = true;
    setCodigo(ativo.data.code);
    setNome(ativo.data.name);
  }, [ativo.data]);

  const aoConcluir = async (mensagem: string) => {
    await queryClient.invalidateQueries({ queryKey: ["script-ativo"] });
    await queryClient.invalidateQueries({ queryKey: ["scripts"] });
    toast.success(mensagem);
  };

  const mutSalvar = useMutation({
    mutationFn: () => salvar({ data: { name: nome, code: codigo, notes: notas || undefined } }),
    onSuccess: async (resumo) => {
      setNotas("");
      await aoConcluir(`Gravado como versao ${resumo.version}.`);
    },
    onError: (erro: Error) => toast.error(erro.message || "Nao foi possivel salvar"),
  });

  const mutAtivar = useMutation({
    mutationFn: (id: string) => ativar({ data: { id } }),
    onSuccess: async (resumo) => {
      carregado.current = false;
      await aoConcluir(`Versao ${resumo.version} reativada.`);
    },
    onError: (erro: Error) => toast.error(erro.message || "Nao foi possivel reativar"),
  });

  const mutRestaurar = useMutation({
    mutationFn: () => restaurar(),
    onSuccess: async (resumo) => {
      carregado.current = false;
      setConfirmandoRestauro(false);
      await aoConcluir(`Padrao gravado como versao ${resumo.version}.`);
    },
    onError: (erro: Error) => toast.error(erro.message || "Nao foi possivel restaurar"),
  });

  const carregarDeArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    // O arquivo só preenche o campo. Nada sobe para o servidor até alguém
    // clicar em salvar — e é isso que dá espaço para testar antes.
    setCodigo(await arquivo.text());
    setNome((atual) => atual || arquivo.name.replace(/\.js$/i, ""));
    toast.success("Arquivo carregado no editor. Teste antes de salvar.");
  };

  if (ativo.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando o script…</p>;
  }

  const alterado = ativo.data ? codigo !== ativo.data.code || nome !== ativo.data.name : true;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Script de geracao de FAQs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          E este script que transforma o documento enviado em perguntas e respostas, e e dele que
          saem os modelos vazios. Salvar cria uma versao nova — a anterior continua guardada e pode
          ser reativada.
        </p>
      </div>

      {ativo.data ? (
        <p className="text-sm text-muted-foreground">
          Em uso: <strong className="text-foreground">{ativo.data.name}</strong>, versao{" "}
          {ativo.data.version}
          {ativo.data.createdByName ? `, por ${ativo.data.createdByName}` : ""} em{" "}
          {new Date(ativo.data.createdAt).toLocaleDateString("pt-BR")}
        </p>
      ) : (
        <p className="text-sm text-destructive">
          Nenhum script ativo. A importacao fica indisponivel ate um ser salvo.
        </p>
      )}

      <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
        <p className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <strong>Este script vale so para a importacao pelo dashboard.</strong> A ingestao que le
            o Google Drive (<code>scripts/enviar_dados.py</code>) continua com os marcadores fixos
            no codigo. Se os dois divergirem, o Drive para de render FAQs sem dar erro nenhum.
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="codigo-script">Codigo</Label>
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputArquivo}
              type="file"
              accept=".js,text/javascript"
              className="hidden"
              onChange={(e) => void carregarDeArquivo(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => inputArquivo.current?.click()}
            >
              <Upload className="size-4" /> Carregar .js
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmandoRestauro(true)}
            >
              <RotateCcw className="size-4" /> Restaurar padrao
            </Button>
          </div>
        </div>

        <Textarea
          id="codigo-script"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          rows={18}
          spellCheck={false}
          className="font-mono text-xs"
        />
      </div>

      <PainelTeste codigo={codigo} />

      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Modelos vazios gerados por este script</h3>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          Baixe para conferir se o formato bate com o que o script espera. Sai do codigo que esta no
          editor, nao do que esta salvo.
        </p>
        <ModeloBotoes codigo={codigo} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nome-script">Nome</Label>
          <Input
            id="nome-script"
            value={nome}
            maxLength={120}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Padrao P/R com marcador novo"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notas-script">O que mudou</Label>
          <Input
            id="notas-script"
            value={notas}
            maxLength={500}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ex.: aceita PERG: alem de P:"
          />
        </div>
      </div>

      <Button
        type="button"
        disabled={mutSalvar.isPending || !alterado || nome.trim().length < 3}
        onClick={() => mutSalvar.mutate()}
      >
        <Save className="size-4" />
        {mutSalvar.isPending ? "Salvando…" : alterado ? "Salvar nova versao" : "Sem alteracoes"}
      </Button>

      <div className="rounded-lg border border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4" /> Versoes
        </h3>
        <ul className="mt-3 space-y-2">
          {(versoes.data ?? []).map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-2 text-sm last:border-0"
            >
              <span className="font-medium">v{v.version}</span>
              <span className="min-w-0 flex-1 truncate">{v.name}</span>
              {v.notes && (
                <span className="w-full text-xs text-muted-foreground sm:w-auto">{v.notes}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {v.createdByName ?? "—"} · {new Date(v.createdAt).toLocaleDateString("pt-BR")}
              </span>
              {v.isActive ? (
                <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                  em uso
                </span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={mutAtivar.isPending}
                  onClick={() => mutAtivar.mutate(v.id)}
                >
                  Reativar
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <AlertDialog open={confirmandoRestauro} onOpenChange={setConfirmandoRestauro}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar o script padrao?</AlertDialogTitle>
            <AlertDialogDescription>
              O padrao embutido no codigo vira uma versao nova e passa a ser o ativo. Nada e
              apagado: as versoes anteriores continuam na lista e podem ser reativadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                mutRestaurar.mutate();
              }}
              disabled={mutRestaurar.isPending}
            >
              {mutRestaurar.isPending ? "Restaurando…" : "Restaurar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
