import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apagarConversa } from "@/lib/conversas.functions";
import { Button } from "@/components/ui/button";
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

/**
 * Apagar uma conversa a pedido de quem a teve.
 *
 * LÓGICA DO LUCIANO: o chat já deixa a pessoa apagar a própria conversa, mas só
 * enquanto ela está no aparelho. Quem trocou de celular ou limpou o navegador
 * pede à equipe, e é aqui que o pedido é atendido.
 *
 * O botão é discreto de propósito. Não é ferramenta de faxina: apagar conversa
 * por conta própria tiraria dado da validação sem ninguém ter pedido, e a
 * auditoria registraria uma "exclusão a pedido" que não houve.
 */
export function ApagarConversa({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const apagar = useServerFn(apagarConversa);
  const [aberto, setAberto] = useState(false);

  const mutation = useMutation({
    mutationFn: () => apagar({ data: { id } }),
    onSuccess: async () => {
      // Tudo, e não uma lista de chaves: a exclusão mexe na lista e nos números
      // das conversas e também nas sugestões e rodadas da curadoria.
      await queryClient.invalidateQueries();
      toast.success("Conversa apagada");
      setAberto(false);
      await navigate({ to: "/conversas" });
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível apagar"),
  });

  return (
    <>
      <Button variant="perigo" onClick={() => setAberto(true)}>
        <Trash2 /> Apagar a pedido da pessoa
      </Button>

      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Use só quando a pessoa pedir a exclusão. As mensagens e a avaliação são apagadas, e
              as perguntas copiadas pela curadoria são trocadas por uma marca de exclusão. Não dá
              para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(evento) => {
                evento.preventDefault();
                mutation.mutate();
              }}
            >
              {mutation.isPending ? "Apagando…" : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
