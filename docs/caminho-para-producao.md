# Caminho para produção

O que precisa estar resolvido antes de o chatbot atender cidadãos de verdade. Nada aqui bloqueia um teste; alguns itens têm prazo longo e por isso precisam começar cedo.

---

## Número institucional

O chip dedicado resolve o teste. Para atendimento real o número precisa ser institucional — não pode ficar amarrado a uma pessoa. Três motivos: a pessoa sai e o canal morre junto; conversas de saúde de cidadãos ficam num aparelho particular (problema direto de LGPD); e não há responsável institucional pelo canal.

---

## API oficial da Meta — o gatilho é anterior à necessidade

Hoje o gateway usa o **Baileys**, biblioteca não-oficial — o mesmo motor que o WAHA usava por baixo. Trocar o WAHA pelo backend próprio **não aumentou** o risco, mas o risco existe:

> O WhatsApp pode bloquear o número a qualquer momento, sem aviso e sem recurso. Isso é inerente a qualquer solução não-oficial, e cresce com o volume de mensagens.

Para uso municipal o destino é a **WhatsApp Cloud API oficial**, a única com garantia contratual. O que a Meta exige, e só a instituição pode providenciar:

| Item | Detalhe |
|---|---|
| Meta Business Manager verificado | CNPJ da prefeitura/secretaria e documentos do representante legal |
| Número dedicado **limpo** | Não pode estar registrado em nenhum WhatsApp (nem comum, nem Business). Se estiver, precisa ser desvinculado antes |
| Aprovação do perfil | A Meta revisa nome de exibição e categoria |
| Orçamento | Cobrança por conversa. Conversas iniciadas pelo cidadão têm janela gratuita de 24h; mensagens iniciadas pela prefeitura são pagas e o texto precisa de aprovação prévia |

**A verificação leva semanas** e depende da velocidade dos documentos. O gatilho para começar é bem antes de precisar: assim que houver definição de que vai para a instituição.

---

## Hospedagem

Rodar na máquina local é adequado para teste. Para atendimento real: VPS, **preferencialmente em região Brasil** — dado de saúde é dado sensível, e manter o processamento em território nacional simplifica muito a conformidade. Requisito estimado: 2 vCPU / 4 GB RAM.

Enquanto o n8n rodar numa máquina pessoal, **tudo depende dela**: se o PC dormir, o Docker parar ou a internet cair, o chatbot e o protótipo param juntos.

Precisa de política de backup para três volumes:

| Volume | O que se perde |
|---|---|
| `wa_sessions` | Credenciais do WhatsApp — exige parear de novo |
| `n8n_data` | Fluxos e credenciais — significa reconfigurar tudo do zero |
| `postgres_data` | Usuários e papéis do dashboard |

A base de FAQs fica no Atlas, fora desses volumes, e tem backup próprio pelo [backup_faqs.py](../scripts/backup_faqs.py).

---

## Chave e cota do Gemini

Hoje o projeto roda **só na cota gratuita**, sem billing ativo. Quando a cota do dia acaba, o bot para de responder até o dia seguinte — e a mensagem que o cidadão vê é a de indisponibilidade.

Contas aproximadas: cada mensagem gasta **1 chat + 1 embedding**. Com os tetos gratuitos atuais, isso dá algo como 500 conversas/dia. Reindexar a base inteira gasta uma chamada de embedding por FAQ (~2500).

Além do teto, há a questão de **de quem é a chave**: o fluxo do WhatsApp ainda usa uma credencial que é chave pessoal de um integrante. Se a pessoa sair do grupo ou revogar a chave, o bot cai. Antes de atender alguém, a chave precisa ser do projeto, com billing e teto de gasto definidos.

---

## LGPD das conversas

O protótipo já cumpre consentimento, política, retenção e exclusão — o que falta é institucional: base legal do serviço, encarregado de dados, política oficial do órgão e opt-out no WhatsApp. A lista completa, com o que já está feito, está em [privacidade-e-lgpd.md](privacidade-e-lgpd.md).

---

## Contas e avisos push

Estão em validação no `/staging` do protótipo. Antes de contar com eles para lembrar alguém de um exame:

- **Os números da validação.** A matriz de [notificacoes-push.md](notificacoes-push.md#os-limites-e-como-medi-los) preenchida com aparelhos reais — em especial iPhone instalado na Tela de Início e Android com economia de bateria. Se a taxa de exibição for baixa num tipo de aparelho comum no público, o push não pode ser o único canal do lembrete.
- **Um servidor para o despachante.** Ele roda no container do PWA; com o PC desligado, nenhum aviso sai e os vencidos são descartados.
- **Confirmação de e-mail.** Sem envio de e-mail, a conta de senha não prova que o endereço é de quem a criou. O vínculo com o Google já se protege disso, mas recuperar senha e avisar o dono do endereço dependem de um serviço de envio.
- **As decisões de LGPD** de contas e lembretes, listadas em [privacidade-e-lgpd.md](privacidade-e-lgpd.md#o-que-depende-da-instituição).

---

## Identificação do cliente

Quando houver definição de qual prefeitura ou secretaria, isso destrava de uma vez a política de privacidade, a base legal, o perfil na Meta e o nome oficial do bot.

---

## O que já está pronto para a transição

Nada acima exige reescrever o projeto:

- **Troca de provedor sem mexer no domínio.** A porta [`WhatsAppProvider`](../backend/src/channels/whatsapp/domain/whatsapp-provider.port.ts) isola o Baileys atrás de uma interface. Migrar para a Cloud API é escrever um segundo adapter — o resto do backend não muda.
- **Configuração validada no boot.** O [env.schema.ts](../backend/src/config/env.schema.ts) recusa subir a aplicação se faltar segredo ou se uma URL estiver malformada, em vez de falhar em produção.
- **Política anti-ban ativa.** Envios serializados, com atraso aleatório e "digitando" simulado — reduz o risco enquanto o número for não-oficial.
- **Conteúdo de mensagem nunca vai para o log.**
- **Exclusão e retenção implementadas** no protótipo, prontas para virar política do serviço.
