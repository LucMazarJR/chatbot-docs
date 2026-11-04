import { Conversa } from '@/components/Conversa';

/**
 * O chat anônimo, em validação.
 *
 * O chat inteiro mora em `components/Conversa.tsx`, compartilhado com o
 * staging. O que difere de lá é só o que depende de conta: aqui a conversa
 * vive no aparelho, começa pelo aceite e não tem Minha conta nem avisos.
 */
export default function Pagina() {
  return <Conversa comTutorial comVoz />;
}
