/**
 * Forma de comparar e-mails.
 *
 * Só minúsculo e espaço nas pontas. Não remove pontos nem o trecho depois do
 * "+": isso vale para o Gmail, mas em outros provedores `ana.silva` e
 * `anasilva` são pessoas diferentes, e juntar as duas contas seria entregar os
 * lembretes de saúde de uma para a outra.
 */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Checagem de formato, não de existência.
 *
 * Validar e-mail por regex completa é uma causa perdida; o objetivo aqui é só
 * pegar erro de digitação óbvio antes de criar a conta. Quem prova que o
 * endereço existe e é da pessoa é o login pelo Google.
 */
export function emailValido(email: string): boolean {
  const limpo = email.trim();
  return limpo.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpo);
}
