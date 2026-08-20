import { useEffect, useState } from "react";

/**
 * Atrasa a propagação de um valor que muda a cada tecla.
 *
 * A busca das FAQs entra na chave do react-query e vira uma chamada ao
 * servidor. Sem o atraso, digitar "farmácia" dispara oito requisições e oito
 * varreduras no Mongo — sete delas descartadas antes de chegar na tela.
 */
export function useDebouncedValue<T>(valor: T, atrasoMs = 300): T {
  const [atrasado, setAtrasado] = useState(valor);

  useEffect(() => {
    const id = setTimeout(() => setAtrasado(valor), atrasoMs);
    return () => clearTimeout(id);
  }, [valor, atrasoMs]);

  return atrasado;
}
