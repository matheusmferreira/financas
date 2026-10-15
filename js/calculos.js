// Regras de negócio puras (sem tela), para poderem ser testadas isoladamente.
// Todo valor em dinheiro é guardado em centavos inteiros, para não acumular erro de ponto flutuante.

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarMoeda(centavos) {
  return formatoMoeda.format(centavos / 100);
}

export function centavosParaTexto(centavos) {
  return (centavos / 100).toFixed(2).replace('.', ',');
}

// Aceita "1.234,56", "1234,56", "1234.56" e "12" — teclados de celular variam entre vírgula e ponto.
export function lerValorEmCentavos(texto, { permitirNegativo = false } = {}) {
  let limpo = String(texto ?? '').trim().replace(/[R$\s]/g, '');
  if (limpo === '') return null;
  if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) limpo = limpo.replace(/\./g, '');
  const numero = Number(limpo);
  if (!Number.isFinite(numero)) return null;
  if (numero < 0 && !permitirNegativo) return null;
  return Math.round(numero * 100);
}

export function hojeISO() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export function mesDe(dataISO) {
  return dataISO.slice(0, 7);
}

export function somarMeses(mes, quantidade) {
  const [ano, numeroMes] = mes.split('-').map(Number);
  const total = ano * 12 + (numeroMes - 1) + quantidade;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function mesesEntre(mesInicial, mesFinal) {
  const [anoA, mesA] = mesInicial.split('-').map(Number);
  const [anoB, mesB] = mesFinal.split('-').map(Number);
  return (anoB - anoA) * 12 + (mesB - mesA);
}

// Dia 31 em fevereiro vira o último dia de fevereiro, como os bancos fazem.
export function dataNoMes(mes, dia) {
  const [ano, numeroMes] = mes.split('-').map(Number);
  const ultimoDia = new Date(ano, numeroMes, 0).getDate();
  return `${mes}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
}

export function nomeDoMes(mes, { curto = false } = {}) {
  const [ano, numeroMes] = mes.split('-').map(Number);
  const data = new Date(ano, numeroMes - 1, 1);
  if (curto) return data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const nome = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export function nomeDoDia(dataISO) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const nome = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

// Compra feita no dia do fechamento ou depois já vai para a fatura seguinte.
// Se o vencimento é antes do fechamento no calendário (ex.: fecha 28, vence 5), a fatura vence no mês seguinte ao fechamento.
export function mesDaPrimeiraFatura(dataCompra, instituicao) {
  const diaCompra = Number(dataCompra.slice(8, 10));
  let mesFechamento = mesDe(dataCompra);
  if (diaCompra >= instituicao.diaFechamento) mesFechamento = somarMeses(mesFechamento, 1);
  return instituicao.diaVencimento > instituicao.diaFechamento ? mesFechamento : somarMeses(mesFechamento, 1);
}

// O centavo que sobra da divisão vai na primeira parcela, igual ao que as operadoras fazem.
export function dividirEmParcelas(valorTotal, quantidade) {
  const base = Math.floor(valorTotal / quantidade);
  const resto = valorTotal - base * quantidade;
  return Array.from({ length: quantidade }, (_, indice) => (indice === 0 ? base + resto : base));
}

export function gerarParcelasDoCartao({ compraId, descricao, categoriaId, instituicao, valorTotal, parcelas, dataCompra, criarId }) {
  const primeiroMes = mesDaPrimeiraFatura(dataCompra, instituicao);
  return dividirEmParcelas(valorTotal, parcelas).map((valor, indice) => ({
    id: criarId(),
    tipo: 'despesa',
    valor,
    data: dataNoMes(somarMeses(primeiroMes, indice), instituicao.diaVencimento),
    descricao,
    categoriaId,
    instituicaoId: instituicao.id,
    credito: true,
    pago: true,
    compra: { id: compraId, valorTotal, parcelas, dataCompra, numero: indice + 1 },
  }));
}

export function chaveFatura(instituicaoId, mes) {
  return `${instituicaoId}|${mes}`;
}

export function lancamentosDoMes(lancamentos, mes) {
  return lancamentos.filter((lancamento) => mesDe(lancamento.data) === mes);
}

export function totalDaFatura(lancamentos, instituicaoId, mes) {
  return lancamentosDoMes(lancamentos, mes)
    .filter((lancamento) => lancamento.credito && lancamento.instituicaoId === instituicaoId)
    .reduce((soma, lancamento) => soma + lancamento.valor, 0);
}

export function resumoDoMes(estado, mes) {
  const doMes = lancamentosDoMes(estado.lancamentos, mes);
  const receitas = doMes.filter((l) => l.tipo === 'receita').reduce((soma, l) => soma + l.valor, 0);
  const despesas = doMes.filter((l) => l.tipo === 'despesa').reduce((soma, l) => soma + l.valor, 0);
  const contasPendentes = doMes
    .filter((l) => l.tipo === 'despesa' && !l.credito && !l.pago)
    .reduce((soma, l) => soma + l.valor, 0);
  const faturasPendentes = estado.instituicoes
    .filter((instituicao) => !estado.faturasPagas.includes(chaveFatura(instituicao.id, mes)))
    .reduce((soma, instituicao) => soma + totalDaFatura(estado.lancamentos, instituicao.id, mes), 0);
  return { receitas, despesas, saldo: receitas - despesas, aPagar: contasPendentes + faturasPendentes };
}

// Entradas e saídas de dinheiro da conta, com data: tudo que já foi pago/recebido por ela (débito, Pix, dinheiro),
// transferências e faturas do cartão dela já marcadas como pagas (na data do vencimento).
// Transferência só move dinheiro entre instituições: não entra em receitas/despesas do mês.
function movimentosDaInstituicao(estado, instituicao) {
  const movimentos = [];
  for (const lancamento of estado.lancamentos) {
    if (lancamento.credito || !lancamento.pago) continue;
    if (lancamento.tipo === 'transferencia') {
      if (lancamento.instituicaoId === instituicao.id) movimentos.push({ data: lancamento.data, valor: -lancamento.valor });
      if (lancamento.destinoId === instituicao.id) movimentos.push({ data: lancamento.data, valor: lancamento.valor });
      continue;
    }
    if (lancamento.instituicaoId !== instituicao.id) continue;
    movimentos.push({ data: lancamento.data, valor: lancamento.tipo === 'receita' ? lancamento.valor : -lancamento.valor });
  }
  for (const chave of estado.faturasPagas) {
    const [instituicaoId, mes] = chave.split('|');
    if (instituicaoId !== instituicao.id) continue;
    movimentos.push({ data: dataNoMes(mes, instituicao.diaVencimento), valor: -totalDaFatura(estado.lancamentos, instituicao.id, mes) });
  }
  return movimentos;
}

export function saldoDaInstituicao(estado, instituicao) {
  return movimentosDaInstituicao(estado, instituicao).reduce((saldo, movimento) => saldo + movimento.valor, instituicao.saldoInicial);
}

export function diasCorridosEntre(dataInicialISO, dataFinalISO) {
  const milissegundos = new Date(`${dataFinalISO}T12:00:00`) - new Date(`${dataInicialISO}T12:00:00`);
  return Math.max(0, Math.round(milissegundos / 86400000));
}

// Simulação do quanto a conta rendeu: CDI informado pelo usuário aplicado a todo o período (não o histórico real),
// juros compostos sobre cada entrada/saída desde a data dela, valor bruto (antes do IR).
// O % do CDI incide na taxa diária de 252 dias úteis (como os bancos fazem); o período é contado em dias corridos
// convertidos para 252/365, porque contar só seg–sex sem feriados dá 260 dias/ano e superestima ~3%.
// O saldo informado no cadastro rende a partir de quando o rendimento foi ligado (rendeDesde);
// cada lançamento rende desde a própria data, para depósitos antigos registrados depois também renderem.
export function rendimentoDaInstituicao(estado, instituicao, hoje) {
  if (!instituicao.percentualCdi || !estado.cdiAnual) return 0;
  const taxaDiaria = ((1 + estado.cdiAnual / 100) ** (1 / 252) - 1) * (instituicao.percentualCdi / 100);
  const movimentos = [{ data: instituicao.rendeDesde, valor: instituicao.saldoInicial }, ...movimentosDaInstituicao(estado, instituicao)];
  let rendimento = 0;
  for (const { data, valor } of movimentos) {
    const diasUteisEquivalentes = (diasCorridosEntre(data, hoje) * 252) / 365;
    rendimento += valor * ((1 + taxaDiaria) ** diasUteisEquivalentes - 1);
  }
  return Math.round(rendimento);
}

export function gastosPorCategoria(lancamentos, mes) {
  const totais = new Map();
  for (const lancamento of lancamentosDoMes(lancamentos, mes)) {
    if (lancamento.tipo !== 'despesa') continue;
    totais.set(lancamento.categoriaId, (totais.get(lancamento.categoriaId) ?? 0) + lancamento.valor);
  }
  return totais;
}

// Gera, uma única vez por mês, o lançamento pendente de cada conta fixa.
// A chave fica registrada mesmo se o lançamento for excluído depois, para ele não voltar sozinho.
export function lancamentosDasFixas(estado, mes, criarId) {
  const novos = [];
  for (const fixa of estado.fixas) {
    const chave = `${fixa.id}|${mes}`;
    if (fixa.inicio > mes || estado.fixasGeradas.includes(chave)) continue;
    novos.push({
      chave,
      lancamento: {
        id: criarId(),
        tipo: fixa.tipo,
        valor: fixa.valor,
        data: dataNoMes(mes, fixa.dia),
        descricao: fixa.descricao,
        categoriaId: fixa.categoriaId,
        instituicaoId: fixa.instituicaoId,
        credito: false,
        pago: false,
        fixaId: fixa.id,
      },
    });
  }
  return novos;
}

export function valorMensalParaMeta(meta, mesAtual) {
  const falta = meta.alvo - meta.guardado;
  if (falta <= 0 || !meta.prazo) return null;
  const meses = Math.max(1, mesesEntre(mesAtual, meta.prazo) + 1);
  return Math.ceil(falta / meses);
}
