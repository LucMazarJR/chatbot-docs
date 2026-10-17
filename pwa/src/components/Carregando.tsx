/**
 * Sinal de que algo está chegando.
 *
 * LÓGICA DO LUCIANO: as telas mostravam "Nenhum aviso ainda." enquanto a lista
 * ainda vinha pela rede, e o chat ficava em branco enquanto abria a conversa.
 * Quem vê isso conclui que não existe nada e vai embora antes de os dados
 * aparecerem. Enquanto espera, a tela diz que está esperando, e diz o quê.
 *
 * `role="status"` para o leitor de tela anunciar sem interromper. Sem hooks,
 * então serve tanto em página de servidor quanto em componente de cliente.
 */
export function Carregando({
  texto,
  variante = 'bloco',
}: {
  texto: string;
  /** `bloco` ocupa o lugar do conteúdo; `linha` cabe numa frase; `balao` é para o fundo do chat. */
  variante?: 'bloco' | 'linha' | 'balao';
}) {
  return (
    <p className={`carregando carregando-${variante}`} role="status" aria-live="polite">
      <span className="carregando-giro" aria-hidden="true" />
      <span>{texto}</span>
    </p>
  );
}
