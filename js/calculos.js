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
// Fechamento no dia 29–31 em mês mais curto acontece no último dia daquele mês.
export function mesDaPrimeiraFatura(dataCompra, instituicao) {
  const diaCompra = Number(dataCompra.slice(8, 10));
  let mesFechamento = mesDe(dataCompra);
  const diaDeFechamentoNoMes = Number(dataNoMes(mesFechamento, instituicao.diaFechamento).slice(8));
  if (diaCompra >= diaDeFechamentoNoMes) mesFechamento = somarMeses(mesFechamento, 1);
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

// O valor pago fica guardado ao marcar a fatura: se entrar compra nova nela depois, a diferença volta a ficar pendente
// em vez de a fatura continuar "paga" com valor maior. Faturas marcadas antes disso não têm valor guardado: vale o total.
export function valorPagoDaFatura(estado, instituicaoId, mes) {
  const chave = chaveFatura(instituicaoId, mes);
  if (!estado.faturasPagas.includes(chave)) return 0;
  return estado.valoresFaturasPagas[chave] ?? totalDaFatura(estado.lancamentos, instituicaoId, mes);
}

export function faltaPagarDaFatura(estado, instituicaoId, mes) {
  return Math.max(0, totalDaFatura(estado.lancamentos, instituicaoId, mes) - valorPagoDaFatura(estado, instituicaoId, mes));
}

export function resumoDoMes(estado, mes) {
  const doMes = lancamentosDoMes(estado.lancamentos, mes);
  const receitas = doMes.filter((l) => l.tipo === 'receita').reduce((soma, l) => soma + l.valor, 0);
  const despesas = doMes.filter((l) => l.tipo === 'despesa').reduce((soma, l) => soma + l.valor, 0);
  const contasPendentes = doMes
    .filter((l) => l.tipo === 'despesa' && !l.credito && !l.pago)
    .reduce((soma, l) => soma + l.valor, 0);
  const faturasPendentes = estado.instituicoes.reduce((soma, instituicao) => soma + faltaPagarDaFatura(estado, instituicao.id, mes), 0);
  return { receitas, despesas, saldo: receitas - despesas, aPagar: contasPendentes + faturasPendentes };
}

// Entradas e saídas de dinheiro da conta, com data: tudo que já foi pago/recebido por ela (débito, Pix, dinheiro),
// transferências e faturas do cartão dela já marcadas como pagas (na data do vencimento).
// Transferência só move dinheiro entre instituições: não entra em receitas/despesas do mês.
// O saldo informado no cadastro é "o saldo de hoje" (saldoEm): lançamentos de antes dessa data já estão nele e
// não contam de novo. Saldo informado zero não tem nada embutido, então o histórico lançado depois conta normalmente.
function movimentosDaInstituicao(estado, instituicao) {
  const jaEstaNoSaldoInformado = (data) => Boolean(instituicao.saldoEm) && instituicao.saldoInicial !== 0 && data < instituicao.saldoEm;
  const movimentos = [];
  for (const lancamento of estado.lancamentos) {
    // jaNoSaldo: pago antes de a pessoa informar o saldo do banco, que já veio sem esse valor; não desconta de novo.
    if (lancamento.credito || !lancamento.pago || lancamento.jaNoSaldo) continue;
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
    movimentos.push({ data: dataNoMes(mes, instituicao.diaVencimento), valor: -valorPagoDaFatura(estado, instituicao.id, mes) });
  }
  return movimentos.filter((movimento) => !jaEstaNoSaldoInformado(movimento.data));
}

// Saldo até hoje: lançamento com data futura (mesmo marcado como pago) só conta quando a data chegar.
export function saldoDaInstituicao(estado, instituicao, hoje) {
  return movimentosDaInstituicao(estado, instituicao)
    .filter((movimento) => movimento.data <= hoje)
    .reduce((saldo, movimento) => saldo + movimento.valor, instituicao.saldoInicial);
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
function movimentosQueRendem(estado, instituicao) {
  return [{ data: instituicao.rendeDesde, valor: instituicao.saldoInicial }, ...movimentosDaInstituicao(estado, instituicao)];
}

function rendimentoDosMovimentos(estado, instituicao, movimentos, ate) {
  if (!estado.cdiAnual) return 0;
  const taxaDiaria = ((1 + estado.cdiAnual / 100) ** (1 / 252) - 1) * (instituicao.percentualCdi / 100);
  let rendimento = 0;
  for (const { data, valor } of movimentos) {
    const diasUteisEquivalentes = (diasCorridosEntre(data, ate) * 252) / 365;
    rendimento += valor * ((1 + taxaDiaria) ** diasUteisEquivalentes - 1);
  }
  return Math.round(rendimento);
}

export function rendimentoDaInstituicao(estado, instituicao, hoje) {
  if (!instituicao.percentualCdi) return 0;
  return rendimentoDosMovimentos(estado, instituicao, movimentosQueRendem(estado, instituicao), hoje);
}

// Contas que rendem: caixinhas e instituições cuja própria conta rende % do CDI.
// Caixinha usa o mesmo formato de conta ({ id, saldoInicial, percentualCdi, rendeDesde }), então saldo e rendimento
// são calculados pelas mesmas funções; lançamentos apontam para ela pelo id, como para uma instituição.
export function contasQueRendem(estado) {
  return [...estado.instituicoes.filter((instituicao) => instituicao.percentualCdi), ...estado.caixinhas];
}

// Último dia considerado no mês: o mês atual para em hoje, para bater com os saldos do Início;
// mês futuro vira previsão até o fim dele.
function limiteDoMes(mes, hoje) {
  return mes === mesDe(hoje) ? hoje : dataNoMes(mes, 31);
}

// Quanto estava guardado no fim do mês: o que foi depositado (líquido de resgates) e o rendimento acumulado até ali.
// contas: todas as que rendem (Gráficos) ou só as de uma instituição (tela dela).
export function guardadoNoFimDoMes(estado, mes, hoje, contas = contasQueRendem(estado)) {
  const fimDoMes = limiteDoMes(mes, hoje);
  let depositado = 0;
  let rendimento = 0;
  for (const conta of contas) {
    const movimentos = movimentosQueRendem(estado, conta).filter((movimento) => movimento.data <= fimDoMes);
    depositado += movimentos.reduce((soma, movimento) => soma + movimento.valor, 0);
    rendimento += rendimentoDosMovimentos(estado, conta, movimentos, fimDoMes);
  }
  return { depositado, rendimento };
}

export function caixinhasDaInstituicao(estado, instituicaoId) {
  return estado.caixinhas.filter((caixinha) => caixinha.instituicaoId === instituicaoId);
}

export function saldoComRendimento(estado, conta, ate) {
  return saldoDaInstituicao(estado, conta, ate) + rendimentoDaInstituicao(estado, conta, ate);
}

// Tudo o que a pessoa tem na instituição: a conta (com rendimento, se render) e as caixinhas dela.
export function totalDaInstituicao(estado, instituicao, hoje) {
  return [instituicao, ...caixinhasDaInstituicao(estado, instituicao.id)]
    .reduce((soma, conta) => soma + saldoComRendimento(estado, conta, hoje), 0);
}

export function rendeuNoMes(estado, contas, mes, hoje) {
  const fim = limiteDoMes(mes, hoje);
  const inicio = dataNoMes(somarMeses(mes, -1), 31);
  return contas.reduce((soma, conta) => soma + rendimentoDaInstituicao(estado, conta, fim) - rendimentoDaInstituicao(estado, conta, inicio), 0);
}

export function resumoDaInstituicaoNoMes(estado, instituicaoId, mes) {
  const entradas = lancamentosDoMes(estado.lancamentos, mes)
    .filter((lancamento) => lancamento.tipo === 'receita' && lancamento.instituicaoId === instituicaoId)
    .reduce((soma, lancamento) => soma + lancamento.valor, 0);
  const gastos = despesasDoMesPorCompetencia(estado.lancamentos, mes)
    .filter((lancamento) => lancamento.instituicaoId === instituicaoId)
    .reduce((soma, lancamento) => soma + lancamento.valor, 0);
  return { entradas, gastos };
}

// Dinheiro que foi para contas que rendem no mês (transferências de entrada menos resgates).
function guardadoNoMes(estado, mes) {
  const rendem = new Set(contasQueRendem(estado).map((conta) => conta.id));
  let guardado = 0;
  for (const lancamento of lancamentosDoMes(estado.lancamentos, mes)) {
    if (lancamento.tipo !== 'transferencia') continue;
    const saiDeQueRende = rendem.has(lancamento.instituicaoId);
    const vaiParaQueRende = rendem.has(lancamento.destinoId);
    if (vaiParaQueRende && !saiDeQueRende) guardado += lancamento.valor;
    if (saiDeQueRende && !vaiParaQueRende) guardado -= lancamento.valor;
  }
  return guardado;
}

function diasNoMes(mes) {
  return Number(dataNoMes(mes, 31).slice(8));
}

// Quanto ainda posso gastar = entradas do mês − gastos do mês (competência) − meta de guardar (% das entradas).
// Transferir para a caixinha não é gasto: cumpre a meta de guardar, que já foi descontada.
export function planoDoMes(estado, mes, hoje) {
  const entradas = resumoDoMes(estado, mes).receitas;
  const gastos = gastosDoMes(estado.lancamentos, mes);
  const metaGuardar = Math.round((entradas * estado.percentualGuardar) / 100);
  const podeGastar = entradas - gastos - metaGuardar;
  const ehMesAtual = mes === mesDe(hoje);
  const diasRestantes = ehMesAtual ? diasNoMes(mes) - Number(hoje.slice(8)) + 1 : null;
  return {
    entradas,
    gastos,
    metaGuardar,
    guardado: guardadoNoMes(estado, mes),
    podeGastar,
    porDia: ehMesAtual && podeGastar > 0 ? Math.floor(podeGastar / diasRestantes) : null,
    diasRestantes,
  };
}

// Dicas a partir dos números da pessoa, da mais urgente para a menos. Só entra o que vale para ela agora.
// Devolve o tipo da dica (chave) e os números já formatados; o texto vem de mensagens.js, no jeito de falar escolhido.
export function dicasDoMes(estado, mes, hoje) {
  const dicas = [];
  const plano = planoDoMes(estado, mes, hoje);
  const ehMesAtual = mes === mesDe(hoje);

  // Sem entradas no mês, o pedido para cadastrar o salário já aparece no comentário do painel do Início.
  if (plano.entradas > 0 && plano.podeGastar < 0) {
    dicas.push({ nivel: 'alerta', chave: 'passou_planejado', valores: { valor: formatarMoeda(-plano.podeGastar), meta: formatarMoeda(plano.metaGuardar) } });
  }

  const gastosPorCat = gastosPorCategoria(estado.lancamentos, mes);
  const categoriasComLimite = estado.categorias.filter((categoria) => categoria.tipo === 'despesa' && categoria.limite > 0);
  const avisosDeCategoria = categoriasComLimite
    .map((categoria) => ({ categoria, percentual: Math.round(((gastosPorCat.get(categoria.id) ?? 0) / categoria.limite) * 100) }))
    .filter(({ percentual }) => percentual >= 80)
    .sort((a, b) => b.percentual - a.percentual)
    .slice(0, 2);
  for (const { categoria, percentual } of avisosDeCategoria) {
    const excesso = (gastosPorCat.get(categoria.id) ?? 0) - categoria.limite;
    dicas.push(percentual > 100
      ? { nivel: 'alerta', chave: 'categoria_estourou', valores: { categoria: categoria.nome, valor: formatarMoeda(excesso) } }
      : { nivel: 'atencao', chave: 'categoria_perto', valores: { categoria: categoria.nome, percentual, faltam: ehMesAtual ? ` e faltam ${plano.diasRestantes} dias para o mês acabar` : '' } });
  }

  const diaDeHoje = Number(hoje.slice(8));
  if (ehMesAtual && plano.entradas > 0 && plano.podeGastar >= 0 && diaDeHoje >= 5 && plano.gastos > 0) {
    // Contas fixas (aluguel etc.) e parcelas de compras de meses anteriores acontecem uma vez no mês: entram inteiras;
    // só o gasto do dia a dia é projetado pelo ritmo.
    const gastosFixos = despesasDoMesPorCompetencia(estado.lancamentos, mes)
      .filter((lancamento) => lancamento.fixaId || (lancamento.compra && mesDe(lancamento.compra.dataCompra) !== mes))
      .reduce((soma, lancamento) => soma + lancamento.valor, 0);
    const gastosDoDiaADia = plano.gastos - gastosFixos;
    const projecao = gastosFixos + Math.round((gastosDoDiaADia / diaDeHoje) * diasNoMes(mes));
    const planejado = plano.entradas - plano.metaGuardar;
    if (projecao > planejado) {
      dicas.push({ nivel: 'atencao', chave: 'ritmo', valores: { projecao: formatarMoeda(projecao), excesso: formatarMoeda(projecao - planejado) } });
    }
  }

  if (ehMesAtual) {
    const emBreve = lancamentosDoMes(estado.lancamentos, mes)
      .filter((l) => l.tipo === 'despesa' && !l.credito && !l.pago && l.data >= hoje && Number(l.data.slice(8)) - diaDeHoje <= 3);
    for (const conta of emBreve.slice(0, 2)) {
      const dias = Number(conta.data.slice(8)) - diaDeHoje;
      dicas.push({ nivel: 'atencao', chave: 'conta_vence', valores: { conta: conta.descricao, quando: dias === 0 ? 'hoje' : `em ${dias} dia${dias > 1 ? 's' : ''}`, valor: formatarMoeda(conta.valor) } });
    }
  }

  if (plano.entradas > 0) {
    for (const instituicao of estado.instituicoes.filter((i) => i.temCartao)) {
      const fatura = totalDaFatura(estado.lancamentos, instituicao.id, mes);
      const percentual = Math.round((fatura / plano.entradas) * 100);
      if (percentual > 30) {
        dicas.push({ nivel: 'atencao', chave: 'fatura_alta', valores: { banco: instituicao.nome, percentual } });
      }
    }
  }

  if (plano.metaGuardar > 0 && plano.guardado < plano.metaGuardar) {
    dicas.push({ nivel: 'dica', chave: 'meta_guardar', valores: { valor: formatarMoeda(plano.metaGuardar - Math.max(0, plano.guardado)) } });
  }

  const mediaDeGastos = Math.round([1, 2, 3].reduce((soma, atras) => soma + gastosDoMes(estado.lancamentos, somarMeses(mesDe(hoje), -atras)), 0) / 3);
  if (mediaDeGastos > 0) {
    const reserva = contasQueRendem(estado).reduce((soma, conta) => soma + saldoComRendimento(estado, conta, hoje), 0);
    const meses = reserva / mediaDeGastos;
    if (meses < 6) {
      dicas.push({ nivel: 'dica', chave: 'reserva', valores: { meses: meses.toFixed(1).replace('.', ',') } });
    }
  }

  if (categoriasComLimite.length === 0 && plano.gastos > 0) {
    dicas.push({ nivel: 'dica', chave: 'sem_limites' });
  }

  const ordem = { alerta: 0, atencao: 1, dica: 2 };
  return dicas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}

// Mês em que o gasto "aconteceu" (competência): compra no cartão conta no mês da compra e cada parcela no mês seguinte,
// e não no mês da fatura. Assim "quanto posso gastar" e o orçamento caem quando a pessoa passa o cartão.
// "Falta pagar" e a lista de lançamentos continuam pelo mês da fatura, que é quando o dinheiro sai.
export function mesDeCompetencia(lancamento) {
  return lancamento.compra ? somarMeses(mesDe(lancamento.compra.dataCompra), lancamento.compra.numero - 1) : mesDe(lancamento.data);
}

function despesasDoMesPorCompetencia(lancamentos, mes) {
  return lancamentos.filter((lancamento) => lancamento.tipo === 'despesa' && mesDeCompetencia(lancamento) === mes);
}

export function gastosDoMes(lancamentos, mes) {
  return despesasDoMesPorCompetencia(lancamentos, mes).reduce((soma, lancamento) => soma + lancamento.valor, 0);
}

export function gastosPorCategoria(lancamentos, mes) {
  const totais = new Map();
  for (const lancamento of despesasDoMesPorCompetencia(lancamentos, mes)) {
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
