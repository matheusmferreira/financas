# Controle Financeiro (app "Finanças")

App de celular (PWA) para controlar gastos e se organizar mês a mês.
Instala na tela inicial, funciona sem internet e **guarda os dados só no próprio celular** (nada vai para servidor).

**Endereço:** https://matheusmferreira.github.io/financas/ (GitHub Pages, publica sozinho a cada push na `main`).
Cada pessoa que instala tem os próprios dados, separados — o mesmo endereço serve para mais de um usuário.

## O que faz

- **Início (visão geral)**: **ainda posso gastar** = entradas do mês − gastos do mês − meta de guardar (% das entradas, em Ajustes → Planejamento), com valor por dia no mês atual; quanto tenho no total (todas as instituições e caixinhas), quanto falta pagar, até 3 **dicas personalizadas**, instituições, contas do mês e orçamento por categoria.
- **Tela de cada instituição** (tocar no cartão dela): total, entrou/gastou/rendeu no mês, saldo da conta, **caixinhas** (cada uma com seu % do CDI; botões Guardar/Resgatar) com o gráfico do dinheiro guardado nelas, fatura do cartão, gráfico de entradas × gastos e lançamentos só dela.
- **Gasto conta no mês da compra (competência)**: compra no cartão entra em "Gastei", no orçamento e nos gráficos no mês em que foi feita (cada parcela no seu mês); "Falta pagar" e a lista de lançamentos seguem o mês da fatura.
- **Jeito de falar** (Ajustes): **Zoeira** (padrão, debochado e com palavrão, a pedido do dono) ou **Normal**. Saudação pela hora, comentário sobre a situação do mês, reação rápida a cada ação (gasto pequeno/médio/grande, parcelado, entrada, guardar, resgatar, pagar, excluir) e dicas no mesmo tom. Todos os textos ficam em `js/mensagens.js`; textos da tela mudam de um dia para o outro, reações são sorteadas.
- **Dicas**: excesso sobre o planejado, categoria ≥ 80% do limite, ritmo de gasto (contas fixas contam uma vez, só o dia a dia é projetado), conta vencendo em até 3 dias, fatura > 30% das entradas, meta de guardar pendente, reserva < 6 meses de gastos, falta de limites. Regras em `dicasDoMes` (`js/calculos.js`).
- **Lançamentos**: tudo do mês, agrupado por dia, com filtros (saídas, entradas, cartão). Tocar num item edita.
- **Instituições**: Nubank, Itaú, dinheiro etc. Cada uma tem saldo; se tiver cartão, informa fechamento e vencimento.
- **Cofrinho / rende % do CDI**: caixinhas ficam dentro da instituição (a conta também pode render, marcando "A conta rende % do CDI"). Instituição antiga criada só para ser caixinha: editar → "Na verdade é uma caixinha de…" (mantém o id, então as transferências continuam valendo). O CDI anual é informado à mão em Ajustes. O saldo inclui o rendimento ("Rendeu R$ X"). Simulação: CDI informado aplicado ao período todo, juros compostos (taxa diária de 252 dias úteis, período em dias corridos × 252/365), valor bruto antes do IR. Depósito rende desde a data dele; o saldo do cadastro, desde que o rendimento foi ligado.
- **Transferência entre instituições**: tira de uma e põe na outra (ex.: saque do Nubank para o dinheiro). Não conta como entrada nem saída, então não mexe na sobra do mês.
- **Atualização automática**: com internet o app sempre abre a versão publicada; voltando depois de 10+ minutos em segundo plano ele recarrega sozinho (não recarrega com formulário aberto).
- **Cartão de crédito**: a compra cai no mês da fatura (comprou no dia do fechamento ou depois → próxima fatura) e já é dividida nas parcelas (1/10, 2/10...). A fatura aparece em "Contas do mês" para marcar como paga; ao marcar, sai do saldo da instituição.
- **Contas fixas**: aluguel, internet, salário... entram sozinhas todo mês como pendentes.
- **Gráficos**: gastos por categoria no mês, entradas × saídas dos últimos 6 meses e **dinheiro guardado** (depositado + rendimento no fim de cada mês; mês atual até hoje, meses futuros como previsão; tocar na barra mostra os valores).
- **Recarregar mantém a tela**: aba e mês ficam no endereço (`#graficos/2026-11`); abrir pelo ícone começa no Início do mês atual.
- **Metas**: valor alvo, quanto já tem e prazo; o app calcula quanto guardar por mês.
- **Backup**: exportar/importar um arquivo `.json` (em Ajustes).

## Estrutura

| Arquivo | Conteúdo |
|---|---|
| `index.html` | Estrutura das telas, formulários e modelos (`<template>`) |
| `css/estilo.css` | Visual (tema claro/escuro automático) |
| `js/calculos.js` | Regras puras: dinheiro em centavos, meses, fatura, parcelas, saldos |
| `js/mensagens.js` | Tudo o que o app fala com a pessoa, nos jeitos Zoeira e Normal |
| `js/app.js` | Tela: renderização, formulários, backup |
| `sw.js` | Cache para funcionar offline |
| `manifest.webmanifest` + `icones/` | O que torna o site instalável |

Decisões não óbvias estão comentadas no código (centavos inteiros, centavo da divisão na 1ª parcela,
conta fixa que não volta depois de excluída, edição de conta fixa só afeta meses futuros não pagos).

## Arquivo único para Android (sem publicar) — alternativa, não instala na tela inicial

`dist/financas.html` é **saída de build** (CSS e JS embutidos). Nunca editar ele: editar os fontes e rodar
`node ferramentas/gerar-html-unico.mjs`.

No celular:
1. Mande o `financas.html` para o celular (WhatsApp para você mesmo, e-mail ou Drive) e **baixe** na pasta Downloads.
2. Abra pelo app **Arquivos** → toque no `financas.html` → **Abrir com Chrome**.
3. Abra sempre **do mesmo jeito e o mesmo arquivo**: os dados ficam presos ao endereço do arquivo.

Limitações dessa forma: sem modo offline "de app" e sem ícone instalado. Ao **atualizar** o arquivo,
exporte o backup antes, troque o arquivo e importe o backup no novo.

## Publicação

GitHub Pages do repositório `matheusmferreira/financas`, branch `main`, pasta raiz (sem build).
Só HTTPS permite instalar na tela inicial — arquivo aberto do armazenamento nunca mostra essa opção.
O site publicado não contém nenhum dado seu — os lançamentos ficam só no celular.

## Como instalar no celular

- **Android (Chrome ou Brave)**: abra o endereço → menu ⋮ → "Instalar app" / "Adicionar à tela inicial".
- **iPhone (Safari)**: abra o endereço → botão Compartilhar → "Adicionar à Tela de Início".
  No iPhone, use sempre pelo ícone da tela inicial (os dados do app instalado ficam separados dos do Safari).

## Atualizar depois de mudar o código

1. Aumente `VERSAO` em `sw.js` (ex.: `financas-v4`) quando mudar a lista de arquivos, para limpar a cópia antiga.
2. Faça commit e `git push` na `main` (o Pages atualiza em ~1 minuto; o GitHub guarda cache por até 10 minutos).
3. No celular, basta abrir o app com internet: o `sw.js` busca a rede primeiro e só usa a cópia offline sem conexão.

## Cuidados

- Desinstalar o app ou limpar os dados do navegador **apaga os lançamentos**. Exporte backup de vez em quando.
- Trocar de celular: exporte o backup no antigo e importe no novo.

## Regras que evitam erro de conta

- **Saldo na conta hoje** (cadastro da instituição/caixinha): guarda a data (`saldoEm`); lançamentos com data anterior já estão nesse saldo e não são descontados de novo. Saldo informado zero não tem nada embutido, então o histórico conta.
- **Data futura**: só mexe no saldo quando a data chega; lançamento novo com data futura nasce "a pagar".
- **Fatura paga**: guarda o valor pago (`valoresFaturasPagas`); se entrar compra nela depois, a diferença volta a "Falta pagar".
- **Fechamento dia 29–31** em mês curto vale o último dia daquele mês.
- **Formulários**: no HTML "Salvar" é o primeiro botão (Enter/"Ir" do teclado nunca aciona "Excluir"); a ordem visual vem do CSS.

## Histórico

- 15/10/2026 — v1 criada: instituições (com cartão), lançamentos, contas fixas, orçamento, gráficos, metas e backup.
  Testada em Chrome automatizado (tela 390×844): cálculos de fatura/parcelas/saldos conferidos com testes,
  fluxo completo sem erro de JavaScript. O modo offline não pôde ser testado na automação desta máquina
  (o Chrome automatizado não abre o CacheStorage) — conferir no celular: depois de instalar, ativar modo avião e abrir.
