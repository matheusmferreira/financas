import {
  formatarMoeda, centavosParaTexto, lerValorEmCentavos, hojeISO, mesDe, somarMeses, dataNoMes, nomeDoMes, nomeDoDia,
  gerarParcelasDoCartao, chaveFatura, lancamentosDoMes, totalDaFatura, resumoDoMes, saldoDaInstituicao,
  gastosPorCategoria, lancamentosDasFixas, valorMensalParaMeta,
} from './calculos.js';

const CHAVE_ARMAZENAMENTO = 'controle-financeiro:v1';

const INSTITUICOES_CONHECIDAS = [
  ['Nubank', '#820ad1'], ['Itaú', '#ec7000'], ['Bradesco', '#cc092f'], ['Banco do Brasil', '#f5c400'],
  ['Caixa', '#005ca9'], ['Santander', '#ec0000'], ['Inter', '#ff7a00'], ['C6 Bank', '#3a3a3a'],
  ['PicPay', '#21c25e'], ['Mercado Pago', '#00b1ea'], ['PagBank', '#1bb99a'], ['XP', '#4a4a4a'],
  ['BTG Pactual', '#0d2a4f'], ['Sicoob', '#00a091'], ['Sicredi', '#3fa110'], ['Neon', '#00b8d4'],
  ['Next', '#00c853'], ['Will Bank', '#e6c000'], ['Banrisul', '#0060a8'], ['Dinheiro', '#65a30d'],
];

const $ = (seletor) => document.querySelector(seletor);
// crypto.randomUUID só existe em contexto seguro (https); aberto como arquivo no Android pode não existir.
const criarId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

let estado = carregarEstado();
let mesVisivel = mesDe(hojeISO());
let filtroLancamentos = 'todos';
const emEdicao = { lancamento: null, instituicao: null, fixa: null, categoria: null, meta: null, aporte: null };

function estadoInicial() {
  const categoria = (nome, tipo, cor) => ({ id: criarId(), nome, tipo, cor, limite: 0 });
  return {
    versao: 1,
    categorias: [
      categoria('Moradia', 'despesa', '#0f766e'), categoria('Mercado', 'despesa', '#16a34a'),
      categoria('Comer fora', 'despesa', '#f59e0b'), categoria('Transporte', 'despesa', '#2563eb'),
      categoria('Contas da casa', 'despesa', '#0891b2'), categoria('Saúde', 'despesa', '#dc2626'),
      categoria('Lazer', 'despesa', '#db2777'), categoria('Assinaturas', 'despesa', '#7c3aed'),
      categoria('Compras', 'despesa', '#ea580c'), categoria('Educação', 'despesa', '#4f46e5'),
      categoria('Outros', 'despesa', '#64748b'),
      categoria('Salário', 'receita', '#059669'), categoria('Renda extra', 'receita', '#65a30d'),
      categoria('Outras entradas', 'receita', '#64748b'),
    ],
    instituicoes: [{ id: criarId(), nome: 'Dinheiro', cor: '#65a30d', saldoInicial: 0, temCartao: false }],
    lancamentos: [],
    fixas: [],
    fixasGeradas: [],
    faturasPagas: [],
    metas: [],
    ultimoPagamento: null,
  };
}

function carregarEstado() {
  const salvo = localStorage.getItem(CHAVE_ARMAZENAMENTO);
  return salvo ? JSON.parse(salvo) : estadoInicial();
}

function salvarEstado() {
  localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(estado));
}

const buscarCategoria = (id) => estado.categorias.find((categoria) => categoria.id === id);
const buscarInstituicao = (id) => estado.instituicoes.find((instituicao) => instituicao.id === id);

// ---------- Utilidades de tela ----------

function clonarModelo(idModelo) {
  return document.getElementById(idModelo).content.firstElementChild.cloneNode(true);
}

function preencher(elemento, campos) {
  for (const [nome, valor] of Object.entries(campos)) {
    const alvo = elemento.matches(`[data-campo="${nome}"]`) ? elemento : elemento.querySelector(`[data-campo="${nome}"]`);
    alvo.textContent = valor;
  }
}

function pintarMarcador(elemento, cor) {
  elemento.querySelector('.marcador').style.setProperty('--cor', cor);
}

function valorComSinal(lancamento) {
  return `${lancamento.tipo === 'receita' ? '+' : '−'} ${formatarMoeda(lancamento.valor)}`;
}

function montarChips(container, nomeCampo, opcoes, valorSelecionado) {
  container.replaceChildren();
  for (const opcao of opcoes) {
    const chip = clonarModelo('modelo-chip');
    const entrada = chip.querySelector('input');
    entrada.name = nomeCampo;
    entrada.value = opcao.valor;
    entrada.required = true;
    entrada.checked = opcao.valor === valorSelecionado;
    pintarMarcador(chip, opcao.cor);
    preencher(chip, { nome: opcao.nome });
    container.append(chip);
  }
}

function opcoesDeCategoria(tipo) {
  return estado.categorias
    .filter((categoria) => categoria.tipo === tipo)
    .map((categoria) => ({ valor: categoria.id, nome: categoria.nome, cor: categoria.cor }));
}

function opcoesDeInstituicao() {
  return estado.instituicoes.map((instituicao) => ({ valor: instituicao.id, nome: instituicao.nome, cor: instituicao.cor }));
}

function marcarTipo(form, tipo) {
  form.querySelector(`input[name="tipo"][value="${tipo}"]`).checked = true;
}

function falharCampo(campo, mensagem) {
  return { campo, mensagem };
}

// Um único jeito de tratar salvar/excluir/cancelar em todos os diálogos.
// Se a validação falhar, o diálogo continua aberto mostrando a mensagem no campo.
function ligarDialogo(idDialogo, { aoSalvar, aoExcluir }) {
  const form = document.getElementById(idDialogo).querySelector('form');
  form.addEventListener('input', (evento) => evento.target.setCustomValidity?.(''));
  form.addEventListener('submit', (evento) => {
    const acao = evento.submitter?.value;
    if (acao === 'salvar') {
      const erro = aoSalvar(new FormData(form), form);
      if (erro) {
        evento.preventDefault();
        erro.campo.setCustomValidity(erro.mensagem);
        erro.campo.reportValidity();
        return;
      }
    } else if (acao === 'excluir') {
      const excluiu = aoExcluir();
      if (!excluiu) {
        evento.preventDefault();
        return;
      }
    } else {
      return;
    }
    salvarEstado();
    renderizarTudo();
  });
}

function abrirDialogo(idDialogo, { titulo, editando }) {
  const dialogo = document.getElementById(idDialogo);
  const cabecalho = dialogo.querySelector('[data-titulo]');
  if (cabecalho && titulo) cabecalho.textContent = titulo;
  const botaoExcluir = dialogo.querySelector('[data-excluir]');
  if (botaoExcluir) botaoExcluir.hidden = !editando;
  dialogo.showModal();
}

// ---------- Navegação ----------

function trocarTela(nomeTela) {
  document.body.dataset.tela = nomeTela;
  for (const tela of document.querySelectorAll('.tela')) tela.classList.toggle('ativa', tela.id === `tela-${nomeTela}`);
  for (const aba of document.querySelectorAll('.aba')) aba.classList.toggle('ativa', aba.dataset.tela === nomeTela);
  atualizarTitulo();
  window.scrollTo(0, 0);
}

function atualizarTitulo() {
  const titulos = { metas: 'Metas', ajustes: 'Ajustes' };
  $('#titulo-topo').textContent = titulos[document.body.dataset.tela] ?? nomeDoMes(mesVisivel);
}

function trocarMes(quantidade) {
  mesVisivel = somarMeses(mesVisivel, quantidade);
  renderizarTudo();
}

// ---------- Renderização ----------

function gerarContasFixasDoMes() {
  const novos = lancamentosDasFixas(estado, mesVisivel, criarId);
  if (novos.length === 0) return;
  for (const { chave, lancamento } of novos) {
    estado.fixasGeradas.push(chave);
    estado.lancamentos.push(lancamento);
  }
  salvarEstado();
}

function renderizarTudo() {
  gerarContasFixasDoMes();
  atualizarTitulo();
  renderizarInicio();
  renderizarLancamentos();
  renderizarGraficos();
  renderizarMetas();
  renderizarAjustes();
}

function renderizarInicio() {
  const resumo = resumoDoMes(estado, mesVisivel);
  $('#resumo-saldo').textContent = formatarMoeda(resumo.saldo);
  $('#resumo-saldo').classList.toggle('negativo', resumo.saldo < 0);
  $('#resumo-receitas').textContent = formatarMoeda(resumo.receitas);
  $('#resumo-despesas').textContent = formatarMoeda(resumo.despesas);
  $('#resumo-a-pagar').textContent = formatarMoeda(resumo.aPagar);

  renderizarSaldosDasInstituicoes();
  renderizarContasDoMes();
  renderizarOrcamento();
}

function renderizarSaldosDasInstituicoes() {
  const lista = $('#lista-saldos-instituicoes');
  lista.replaceChildren();
  for (const instituicao of estado.instituicoes) {
    const cartao = clonarModelo('modelo-saldo-instituicao');
    const saldo = saldoDaInstituicao(estado, instituicao);
    const fatura = instituicao.temCartao ? totalDaFatura(estado.lancamentos, instituicao.id, mesVisivel) : 0;
    pintarMarcador(cartao, instituicao.cor);
    preencher(cartao, {
      nome: instituicao.nome,
      saldo: formatarMoeda(saldo),
      detalhe: instituicao.temCartao ? `Fatura: ${formatarMoeda(fatura)}` : 'Saldo atual',
    });
    cartao.querySelector('[data-campo="saldo"]').classList.toggle('negativo', saldo < 0);
    cartao.addEventListener('click', () => abrirInstituicao(instituicao));
    lista.append(cartao);
  }
  const botaoAdicionar = document.createElement('button');
  botaoAdicionar.className = 'cartao-instituicao cartao-adicionar';
  botaoAdicionar.textContent = '+ Adicionar';
  botaoAdicionar.addEventListener('click', () => abrirInstituicao(null));
  lista.append(botaoAdicionar);
}

function renderizarContasDoMes() {
  const lista = $('#lista-contas-do-mes');
  lista.replaceChildren();

  const contas = lancamentosDoMes(estado.lancamentos, mesVisivel)
    .filter((lancamento) => !lancamento.credito && (lancamento.fixaId || !lancamento.pago))
    .sort((a, b) => a.data.localeCompare(b.data));
  for (const lancamento of contas) {
    const item = clonarModelo('modelo-conta-do-mes');
    const instituicao = buscarInstituicao(lancamento.instituicaoId);
    preencher(item, {
      titulo: lancamento.descricao,
      detalhe: `Dia ${Number(lancamento.data.slice(8))} · ${instituicao?.nome ?? ''}`,
      valor: valorComSinal(lancamento),
    });
    item.classList.toggle('pago', lancamento.pago);
    item.querySelector('.marcar-pago').addEventListener('click', () => {
      lancamento.pago = !lancamento.pago;
      salvarEstado();
      renderizarTudo();
    });
    item.querySelector('.item-texto').addEventListener('click', () => abrirLancamento(lancamento));
    lista.append(item);
  }

  for (const instituicao of estado.instituicoes.filter((i) => i.temCartao)) {
    const total = totalDaFatura(estado.lancamentos, instituicao.id, mesVisivel);
    if (total === 0) continue;
    const chave = chaveFatura(instituicao.id, mesVisivel);
    const item = clonarModelo('modelo-conta-do-mes');
    preencher(item, {
      titulo: `Fatura ${instituicao.nome}`,
      detalhe: `Vence dia ${instituicao.diaVencimento}`,
      valor: `− ${formatarMoeda(total)}`,
    });
    item.classList.toggle('pago', estado.faturasPagas.includes(chave));
    item.querySelector('.marcar-pago').addEventListener('click', () => {
      estado.faturasPagas = estado.faturasPagas.includes(chave)
        ? estado.faturasPagas.filter((paga) => paga !== chave)
        : [...estado.faturasPagas, chave];
      salvarEstado();
      renderizarTudo();
    });
    item.querySelector('.item-texto').addEventListener('click', () => {
      filtroLancamentos = 'credito';
      trocarTela('lancamentos');
      renderizarLancamentos();
    });
    lista.append(item);
  }
  $('#vazio-contas-do-mes').hidden = lista.children.length > 0;
}

function renderizarOrcamento() {
  const lista = $('#lista-orcamento');
  lista.replaceChildren();
  const gastos = gastosPorCategoria(estado.lancamentos, mesVisivel);
  for (const categoria of estado.categorias.filter((c) => c.tipo === 'despesa' && c.limite > 0)) {
    const gasto = gastos.get(categoria.id) ?? 0;
    const percentual = Math.round((gasto / categoria.limite) * 100);
    const item = clonarModelo('modelo-orcamento');
    preencher(item, { nome: categoria.nome, valores: `${formatarMoeda(gasto)} de ${formatarMoeda(categoria.limite)}` });
    const barra = item.querySelector('.barra-preenchida');
    barra.style.setProperty('--percentual', `${Math.min(percentual, 100)}%`);
    barra.style.setProperty('--cor', categoria.cor);
    item.classList.toggle('alerta', percentual >= 80 && percentual <= 100);
    item.classList.toggle('estourado', percentual > 100);
    lista.append(item);
  }
  $('#vazio-orcamento').hidden = lista.children.length > 0;
}

function detalheDoLancamento(lancamento) {
  const partes = [buscarCategoria(lancamento.categoriaId)?.nome ?? 'Sem categoria'];
  const instituicao = buscarInstituicao(lancamento.instituicaoId);
  if (instituicao) partes.push(lancamento.credito ? `${instituicao.nome} crédito` : instituicao.nome);
  if (lancamento.compra?.parcelas > 1) partes.push(`${lancamento.compra.numero}/${lancamento.compra.parcelas}`);
  if (!lancamento.credito && !lancamento.pago) partes.push(lancamento.tipo === 'receita' ? 'a receber' : 'a pagar');
  return partes.join(' · ');
}

function renderizarLancamentos() {
  for (const filtro of document.querySelectorAll('.filtro')) filtro.classList.toggle('ativo', filtro.dataset.filtro === filtroLancamentos);
  const lista = $('#lista-lancamentos');
  lista.replaceChildren();

  const filtrados = lancamentosDoMes(estado.lancamentos, mesVisivel)
    .filter((lancamento) => {
      if (filtroLancamentos === 'credito') return lancamento.credito;
      return filtroLancamentos === 'todos' || lancamento.tipo === filtroLancamentos;
    })
    .sort((a, b) => b.data.localeCompare(a.data));

  let diaAnterior = null;
  for (const lancamento of filtrados) {
    if (lancamento.data !== diaAnterior) {
      const cabecalho = clonarModelo('modelo-cabecalho-dia');
      preencher(cabecalho, { dia: nomeDoDia(lancamento.data) });
      lista.append(cabecalho);
      diaAnterior = lancamento.data;
    }
    const item = clonarModelo('modelo-item');
    pintarMarcador(item, buscarCategoria(lancamento.categoriaId)?.cor ?? '#64748b');
    preencher(item, { titulo: lancamento.descricao, detalhe: detalheDoLancamento(lancamento), valor: valorComSinal(lancamento) });
    item.querySelector('.item-valor').classList.toggle('positivo', lancamento.tipo === 'receita');
    item.addEventListener('click', () => abrirLancamento(lancamento));
    lista.append(item);
  }
  $('#vazio-lancamentos').hidden = filtrados.length > 0;
}

function renderizarGraficos() {
  const gastos = [...gastosPorCategoria(estado.lancamentos, mesVisivel)].sort((a, b) => b[1] - a[1]);
  const total = gastos.reduce((soma, [, valor]) => soma + valor, 0);
  $('#rosca-total').textContent = formatarMoeda(total);

  // Círculo com circunferência 100: cada fatia usa o próprio percentual como comprimento do traço.
  const svg = $('#grafico-rosca');
  const legenda = $('#legenda-rosca');
  svg.replaceChildren();
  legenda.replaceChildren();
  const novoCirculo = (classe) => {
    const circulo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circulo.setAttribute('cx', '21');
    circulo.setAttribute('cy', '21');
    circulo.setAttribute('r', '15.9155');
    circulo.setAttribute('class', classe);
    return circulo;
  };
  svg.append(novoCirculo('rosca-fundo'));
  let acumulado = 0;
  for (const [categoriaId, valor] of gastos) {
    const categoria = buscarCategoria(categoriaId);
    const percentual = (valor / total) * 100;
    const fatia = novoCirculo('rosca-fatia');
    fatia.setAttribute('stroke-dasharray', `${percentual} ${100 - percentual}`);
    fatia.setAttribute('stroke-dashoffset', String(25 - acumulado));
    fatia.style.setProperty('--cor', categoria?.cor ?? '#64748b');
    svg.append(fatia);
    acumulado += percentual;

    const item = clonarModelo('modelo-legenda');
    pintarMarcador(item, categoria?.cor ?? '#64748b');
    preencher(item, { nome: categoria?.nome ?? 'Sem categoria', valor: `${formatarMoeda(valor)} · ${Math.round(percentual)}%` });
    legenda.append(item);
  }

  const barras = $('#barras-meses');
  barras.replaceChildren();
  const meses = Array.from({ length: 6 }, (_, indice) => somarMeses(mesVisivel, indice - 5));
  const resumos = meses.map((mes) => resumoDoMes(estado, mes));
  const maior = Math.max(1, ...resumos.flatMap((resumo) => [resumo.receitas, resumo.despesas]));
  meses.forEach((mes, indice) => {
    const barra = clonarModelo('modelo-barra-mes');
    barra.querySelector('.coluna-receita').style.setProperty('--altura', `${(resumos[indice].receitas / maior) * 100}%`);
    barra.querySelector('.coluna-despesa').style.setProperty('--altura', `${(resumos[indice].despesas / maior) * 100}%`);
    preencher(barra, { mes: nomeDoMes(mes, { curto: true }) });
    barra.classList.toggle('atual', mes === mesVisivel);
    barras.append(barra);
  });
}

function renderizarMetas() {
  const lista = $('#lista-metas');
  lista.replaceChildren();
  const mesHoje = mesDe(hojeISO());
  for (const meta of estado.metas) {
    const item = clonarModelo('modelo-meta');
    const percentual = Math.min(100, Math.round((meta.guardado / meta.alvo) * 100));
    const mensal = valorMensalParaMeta(meta, mesHoje);
    let dica = `Faltam ${formatarMoeda(Math.max(0, meta.alvo - meta.guardado))}`;
    if (meta.guardado >= meta.alvo) dica = 'Meta atingida!';
    else if (mensal) dica = `Guarde ${formatarMoeda(mensal)} por mês até ${nomeDoMes(meta.prazo).toLowerCase()}`;
    preencher(item, {
      nome: meta.nome,
      percentual: `${percentual}%`,
      valores: `${formatarMoeda(meta.guardado)} de ${formatarMoeda(meta.alvo)}`,
      dica,
    });
    item.querySelector('.barra-preenchida').style.setProperty('--percentual', `${percentual}%`);
    item.querySelector('[data-acao="movimentar"]').addEventListener('click', () => abrirAporte(meta));
    item.querySelector('[data-acao="editar"]').addEventListener('click', () => abrirMeta(meta));
    lista.append(item);
  }
  $('#vazio-metas').hidden = estado.metas.length > 0;
}

function renderizarListaDeAjustes(idLista, itens, aoTocar) {
  const lista = $(idLista);
  lista.replaceChildren();
  for (const { titulo, detalhe, cor, valor, origem } of itens) {
    const item = clonarModelo('modelo-item');
    pintarMarcador(item, cor);
    preencher(item, { titulo, detalhe, valor: valor ?? '' });
    item.addEventListener('click', () => aoTocar(origem));
    lista.append(item);
  }
}

function renderizarAjustes() {
  renderizarListaDeAjustes('#lista-instituicoes', estado.instituicoes.map((instituicao) => ({
    titulo: instituicao.nome,
    detalhe: instituicao.temCartao
      ? `Cartão: fecha dia ${instituicao.diaFechamento}, vence dia ${instituicao.diaVencimento}`
      : 'Sem cartão de crédito',
    cor: instituicao.cor,
    origem: instituicao,
  })), abrirInstituicao);

  renderizarListaDeAjustes('#lista-fixas', estado.fixas.map((fixa) => ({
    titulo: fixa.descricao,
    detalhe: `Todo dia ${fixa.dia} · ${buscarInstituicao(fixa.instituicaoId)?.nome ?? ''}`,
    valor: `${fixa.tipo === 'receita' ? '+' : '−'} ${formatarMoeda(fixa.valor)}`,
    cor: buscarCategoria(fixa.categoriaId)?.cor ?? '#64748b',
    origem: fixa,
  })), abrirFixa);

  const ordenadas = [...estado.categorias].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome));
  renderizarListaDeAjustes('#lista-categorias', ordenadas.map((categoria) => ({
    titulo: categoria.nome,
    detalhe: categoria.tipo === 'receita' ? 'Entrada' : (categoria.limite > 0 ? `Limite ${formatarMoeda(categoria.limite)}/mês` : 'Saída, sem limite'),
    cor: categoria.cor,
    origem: categoria,
  })), abrirCategoria);
}

// ---------- Lançamento ----------

const formLancamento = $('#form-lancamento');

function opcoesDePagamento(tipo) {
  const opcoes = [];
  for (const instituicao of estado.instituicoes) {
    opcoes.push({ valor: `${instituicao.id}|conta`, nome: instituicao.nome, cor: instituicao.cor });
    if (tipo === 'despesa' && instituicao.temCartao) {
      opcoes.push({ valor: `${instituicao.id}|credito`, nome: `${instituicao.nome} crédito`, cor: instituicao.cor });
    }
  }
  return opcoes;
}

function atualizarFormLancamento({ categoriaId, pagamento } = {}) {
  const tipo = formLancamento.tipo.value;
  const categoriaAtual = categoriaId ?? formLancamento.querySelector('input[name="categoriaId"]:checked')?.value;
  const pagamentoAtual = pagamento ?? formLancamento.querySelector('input[name="pagamento"]:checked')?.value;
  montarChips(formLancamento.querySelector('[data-chips="categoriaId"]'), 'categoriaId', opcoesDeCategoria(tipo), categoriaAtual);
  const opcoesPagamento = opcoesDePagamento(tipo);
  const pagamentoValido = opcoesPagamento.some((opcao) => opcao.valor === pagamentoAtual) ? pagamentoAtual : opcoesPagamento[0]?.valor;
  montarChips(formLancamento.querySelector('[data-chips="pagamento"]'), 'pagamento', opcoesPagamento, pagamentoValido);
  formLancamento.querySelector('[data-rotulo-instituicao]').textContent = tipo === 'receita' ? 'Recebeu em' : 'Pagou com';
  formLancamento.querySelector('[data-rotulo-pago]').textContent = tipo === 'receita' ? 'Já recebido' : 'Já pago';
  atualizarCamposDeCredito();
}

function atualizarCamposDeCredito() {
  const credito = formLancamento.querySelector('input[name="pagamento"]:checked')?.value.endsWith('|credito') ?? false;
  formLancamento.querySelector('[data-somente-credito]').hidden = !credito;
  formLancamento.querySelector('[data-sem-credito]').hidden = credito;
}

function abrirLancamento(lancamento) {
  emEdicao.lancamento = lancamento;
  formLancamento.reset();
  const tipo = lancamento?.tipo ?? 'despesa';
  marcarTipo(formLancamento, tipo);
  if (lancamento) {
    const compra = lancamento.compra;
    formLancamento.valor.value = centavosParaTexto(compra ? compra.valorTotal : lancamento.valor);
    formLancamento.descricao.value = lancamento.descricao;
    formLancamento.data.value = compra ? compra.dataCompra : lancamento.data;
    formLancamento.parcelas.value = compra ? compra.parcelas : 1;
    formLancamento.pago.checked = lancamento.pago;
  } else {
    const hoje = hojeISO();
    formLancamento.data.value = mesDe(hoje) === mesVisivel ? hoje : `${mesVisivel}-01`;
  }
  atualizarFormLancamento({
    categoriaId: lancamento?.categoriaId ?? null,
    pagamento: lancamento ? `${lancamento.instituicaoId}|${lancamento.credito ? 'credito' : 'conta'}` : estado.ultimoPagamento,
  });
  abrirDialogo('dialogo-lancamento', { editando: Boolean(lancamento) });
  if (!lancamento) formLancamento.valor.focus();
}

function removerLancamento(lancamento) {
  const compraId = lancamento.compra?.id;
  estado.lancamentos = estado.lancamentos.filter((l) => (compraId ? l.compra?.id !== compraId : l.id !== lancamento.id));
}

ligarDialogo('dialogo-lancamento', {
  aoSalvar(dados, form) {
    const valor = lerValorEmCentavos(dados.get('valor'));
    if (!valor) return falharCampo(form.valor, 'Informe um valor maior que zero.');
    const [instituicaoId, forma] = dados.get('pagamento').split('|');
    const original = emEdicao.lancamento;
    const base = {
      tipo: dados.get('tipo'),
      descricao: dados.get('descricao').trim(),
      categoriaId: dados.get('categoriaId'),
      instituicaoId,
    };
    if (original) removerLancamento(original);

    if (forma === 'credito') {
      const parcelas = Math.max(1, Math.min(48, Number(dados.get('parcelas')) || 1));
      estado.lancamentos.push(...gerarParcelasDoCartao({
        ...base,
        compraId: original?.compra?.id ?? criarId(),
        instituicao: buscarInstituicao(instituicaoId),
        valorTotal: valor,
        parcelas,
        dataCompra: dados.get('data'),
        criarId,
      }));
    } else {
      const lancamento = { ...base, id: original?.id ?? criarId(), valor, data: dados.get('data'), credito: false, pago: dados.get('pago') === 'on' };
      if (original?.fixaId) lancamento.fixaId = original.fixaId;
      estado.lancamentos.push(lancamento);
    }
    estado.ultimoPagamento = dados.get('pagamento');
    return null;
  },
  aoExcluir() {
    const lancamento = emEdicao.lancamento;
    const mensagem = lancamento.compra?.parcelas > 1
      ? `Excluir a compra inteira (${lancamento.compra.parcelas} parcelas)?`
      : 'Excluir este lançamento?';
    if (!confirm(mensagem)) return false;
    removerLancamento(lancamento);
    return true;
  },
});

formLancamento.addEventListener('change', (evento) => {
  if (evento.target.name === 'tipo') atualizarFormLancamento();
  if (evento.target.name === 'pagamento') atualizarCamposDeCredito();
});

// ---------- Instituição ----------

const formInstituicao = $('#form-instituicao');

function atualizarCamposDeCartao() {
  formInstituicao.querySelector('[data-somente-cartao]').hidden = !formInstituicao.temCartao.checked;
}

function abrirInstituicao(instituicao) {
  emEdicao.instituicao = instituicao;
  formInstituicao.reset();
  if (instituicao) {
    formInstituicao.nome.value = instituicao.nome;
    formInstituicao.saldoInicial.value = centavosParaTexto(instituicao.saldoInicial);
    formInstituicao.temCartao.checked = instituicao.temCartao;
    formInstituicao.diaFechamento.value = instituicao.diaFechamento ?? '';
    formInstituicao.diaVencimento.value = instituicao.diaVencimento ?? '';
    formInstituicao.cor.value = instituicao.cor;
  }
  atualizarCamposDeCartao();
  abrirDialogo('dialogo-instituicao', { titulo: instituicao ? 'Editar instituição' : 'Nova instituição', editando: Boolean(instituicao) });
}

formInstituicao.temCartao.addEventListener('change', atualizarCamposDeCartao);

formInstituicao.nome.addEventListener('input', () => {
  if (emEdicao.instituicao) return;
  const nomeDigitado = formInstituicao.nome.value.trim().toLowerCase();
  const conhecida = INSTITUICOES_CONHECIDAS.find(([nome]) => nome.toLowerCase() === nomeDigitado);
  if (conhecida) formInstituicao.cor.value = conhecida[1];
});

ligarDialogo('dialogo-instituicao', {
  aoSalvar(dados, form) {
    const saldoInicial = dados.get('saldoInicial').trim() === '' ? 0 : lerValorEmCentavos(dados.get('saldoInicial'), { permitirNegativo: true });
    if (saldoInicial === null) return falharCampo(form.saldoInicial, 'Valor inválido.');
    const temCartao = dados.get('temCartao') === 'on';
    const diaFechamento = Number(dados.get('diaFechamento'));
    const diaVencimento = Number(dados.get('diaVencimento'));
    if (temCartao && !(diaFechamento >= 1 && diaFechamento <= 31)) return falharCampo(form.diaFechamento, 'Informe o dia do fechamento.');
    if (temCartao && !(diaVencimento >= 1 && diaVencimento <= 31)) return falharCampo(form.diaVencimento, 'Informe o dia do vencimento.');
    const original = emEdicao.instituicao;
    if (original?.temCartao && !temCartao && estado.lancamentos.some((l) => l.credito && l.instituicaoId === original.id)) {
      return falharCampo(form.temCartao, 'Há compras no crédito desta instituição. Exclua-as antes de tirar o cartão.');
    }
    const dadosInstituicao = {
      nome: dados.get('nome').trim(),
      cor: dados.get('cor'),
      saldoInicial,
      temCartao,
      diaFechamento: temCartao ? diaFechamento : null,
      diaVencimento: temCartao ? diaVencimento : null,
    };
    if (original) Object.assign(original, dadosInstituicao);
    else estado.instituicoes.push({ id: criarId(), ...dadosInstituicao });
    return null;
  },
  aoExcluir() {
    const instituicao = emEdicao.instituicao;
    const emUso = estado.lancamentos.some((l) => l.instituicaoId === instituicao.id) || estado.fixas.some((f) => f.instituicaoId === instituicao.id);
    if (emUso) {
      alert('Esta instituição tem lançamentos ou contas fixas. Exclua ou mude esses itens antes.');
      return false;
    }
    if (!confirm(`Excluir ${instituicao.nome}?`)) return false;
    estado.instituicoes = estado.instituicoes.filter((i) => i.id !== instituicao.id);
    return true;
  },
});

// ---------- Conta fixa ----------

const formFixa = $('#form-fixa');

function atualizarFormFixa({ categoriaId, instituicaoId } = {}) {
  const tipo = formFixa.tipo.value;
  const categoriaAtual = categoriaId ?? formFixa.querySelector('input[name="categoriaId"]:checked')?.value;
  const instituicaoAtual = instituicaoId ?? formFixa.querySelector('input[name="instituicaoId"]:checked')?.value;
  montarChips(formFixa.querySelector('[data-chips="categoriaId"]'), 'categoriaId', opcoesDeCategoria(tipo), categoriaAtual);
  montarChips(formFixa.querySelector('[data-chips="instituicaoId"]'), 'instituicaoId', opcoesDeInstituicao(), instituicaoAtual ?? estado.instituicoes[0]?.id);
}

function abrirFixa(fixa) {
  emEdicao.fixa = fixa;
  formFixa.reset();
  marcarTipo(formFixa, fixa?.tipo ?? 'despesa');
  if (fixa) {
    formFixa.descricao.value = fixa.descricao;
    formFixa.valor.value = centavosParaTexto(fixa.valor);
    formFixa.dia.value = fixa.dia;
  }
  atualizarFormFixa({ categoriaId: fixa?.categoriaId ?? null, instituicaoId: fixa?.instituicaoId ?? null });
  abrirDialogo('dialogo-fixa', { titulo: fixa ? 'Editar conta fixa' : 'Nova conta fixa', editando: Boolean(fixa) });
}

formFixa.addEventListener('change', (evento) => {
  if (evento.target.name === 'tipo') atualizarFormFixa();
});

// Mudanças numa conta fixa só valem para os meses ainda não pagos, a partir do mês atual; o histórico fica como estava.
function lancamentosFuturosDaFixa(fixaId) {
  const mesHoje = mesDe(hojeISO());
  return estado.lancamentos.filter((l) => l.fixaId === fixaId && !l.pago && mesDe(l.data) >= mesHoje);
}

ligarDialogo('dialogo-fixa', {
  aoSalvar(dados, form) {
    const valor = lerValorEmCentavos(dados.get('valor'));
    if (!valor) return falharCampo(form.valor, 'Informe um valor maior que zero.');
    const dadosFixa = {
      tipo: dados.get('tipo'),
      descricao: dados.get('descricao').trim(),
      valor,
      dia: Number(dados.get('dia')),
      categoriaId: dados.get('categoriaId'),
      instituicaoId: dados.get('instituicaoId'),
    };
    const original = emEdicao.fixa;
    if (original) {
      Object.assign(original, dadosFixa);
      for (const lancamento of lancamentosFuturosDaFixa(original.id)) {
        Object.assign(lancamento, {
          tipo: dadosFixa.tipo, descricao: dadosFixa.descricao, valor, categoriaId: dadosFixa.categoriaId,
          instituicaoId: dadosFixa.instituicaoId, data: dataNoMes(mesDe(lancamento.data), dadosFixa.dia),
        });
      }
    } else {
      estado.fixas.push({ id: criarId(), inicio: mesDe(hojeISO()), ...dadosFixa });
    }
    return null;
  },
  aoExcluir() {
    const fixa = emEdicao.fixa;
    if (!confirm(`Excluir a conta fixa "${fixa.descricao}"? Os meses já pagos continuam no histórico.`)) return false;
    const futuros = new Set(lancamentosFuturosDaFixa(fixa.id));
    estado.lancamentos = estado.lancamentos.filter((l) => !futuros.has(l));
    estado.fixas = estado.fixas.filter((f) => f.id !== fixa.id);
    return true;
  },
});

// ---------- Categoria ----------

const formCategoria = $('#form-categoria');

function atualizarCampoDeLimite() {
  formCategoria.querySelector('[data-somente-despesa]').hidden = formCategoria.tipo.value !== 'despesa';
}

function abrirCategoria(categoria) {
  emEdicao.categoria = categoria;
  formCategoria.reset();
  marcarTipo(formCategoria, categoria?.tipo ?? 'despesa');
  if (categoria) {
    formCategoria.nome.value = categoria.nome;
    formCategoria.limite.value = categoria.limite > 0 ? centavosParaTexto(categoria.limite) : '';
    formCategoria.cor.value = categoria.cor;
  }
  atualizarCampoDeLimite();
  abrirDialogo('dialogo-categoria', { titulo: categoria ? 'Editar categoria' : 'Nova categoria', editando: Boolean(categoria) });
}

formCategoria.addEventListener('change', atualizarCampoDeLimite);

ligarDialogo('dialogo-categoria', {
  aoSalvar(dados, form) {
    const tipo = dados.get('tipo');
    const textoLimite = dados.get('limite').trim();
    const limite = tipo === 'despesa' && textoLimite !== '' ? lerValorEmCentavos(textoLimite) : 0;
    if (limite === null) return falharCampo(form.limite, 'Valor inválido.');
    const dadosCategoria = { nome: dados.get('nome').trim(), tipo, cor: dados.get('cor'), limite };
    if (emEdicao.categoria) Object.assign(emEdicao.categoria, dadosCategoria);
    else estado.categorias.push({ id: criarId(), ...dadosCategoria });
    return null;
  },
  aoExcluir() {
    const categoria = emEdicao.categoria;
    const emUso = estado.lancamentos.some((l) => l.categoriaId === categoria.id) || estado.fixas.some((f) => f.categoriaId === categoria.id);
    if (emUso) {
      alert('Esta categoria já tem lançamentos. Mude a categoria deles antes de excluir.');
      return false;
    }
    if (!confirm(`Excluir a categoria ${categoria.nome}?`)) return false;
    estado.categorias = estado.categorias.filter((c) => c.id !== categoria.id);
    return true;
  },
});

// ---------- Metas ----------

const formMeta = $('#form-meta');
const formAporte = $('#form-aporte');

function abrirMeta(meta) {
  emEdicao.meta = meta;
  formMeta.reset();
  if (meta) {
    formMeta.nome.value = meta.nome;
    formMeta.alvo.value = centavosParaTexto(meta.alvo);
    formMeta.guardado.value = centavosParaTexto(meta.guardado);
    formMeta.prazo.value = meta.prazo ?? '';
  }
  abrirDialogo('dialogo-meta', { titulo: meta ? 'Editar meta' : 'Nova meta', editando: Boolean(meta) });
}

function abrirAporte(meta) {
  emEdicao.aporte = meta;
  formAporte.reset();
  abrirDialogo('dialogo-aporte', { titulo: meta.nome });
  formAporte.valor.focus();
}

ligarDialogo('dialogo-meta', {
  aoSalvar(dados, form) {
    const alvo = lerValorEmCentavos(dados.get('alvo'));
    if (!alvo) return falharCampo(form.alvo, 'Informe quanto quer juntar.');
    const guardado = dados.get('guardado').trim() === '' ? 0 : lerValorEmCentavos(dados.get('guardado'));
    if (guardado === null) return falharCampo(form.guardado, 'Valor inválido.');
    const dadosMeta = { nome: dados.get('nome').trim(), alvo, guardado, prazo: dados.get('prazo') || null };
    if (emEdicao.meta) Object.assign(emEdicao.meta, dadosMeta);
    else estado.metas.push({ id: criarId(), ...dadosMeta });
    return null;
  },
  aoExcluir() {
    if (!confirm(`Excluir a meta "${emEdicao.meta.nome}"?`)) return false;
    estado.metas = estado.metas.filter((m) => m.id !== emEdicao.meta.id);
    return true;
  },
});

ligarDialogo('dialogo-aporte', {
  aoSalvar(dados, form) {
    const valor = lerValorEmCentavos(dados.get('valor'));
    if (!valor) return falharCampo(form.valor, 'Informe um valor maior que zero.');
    const meta = emEdicao.aporte;
    meta.guardado = Math.max(0, meta.guardado + (dados.get('operacao') === 'retirar' ? -valor : valor));
    return null;
  },
});

// ---------- Backup ----------

function exportarBackup() {
  const arquivo = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(arquivo);
  link.download = `financas-backup-${hojeISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importarBackup(arquivo) {
  let dados;
  try {
    dados = JSON.parse(await arquivo.text());
  } catch {
    alert('Este arquivo não é um backup válido.');
    return;
  }
  const camposObrigatorios = ['categorias', 'instituicoes', 'lancamentos', 'fixas', 'fixasGeradas', 'faturasPagas', 'metas'];
  if (dados?.versao !== 1 || !camposObrigatorios.every((campo) => Array.isArray(dados[campo]))) {
    alert('Este arquivo não é um backup deste app.');
    return;
  }
  if (!confirm('Importar vai substituir todos os dados atuais deste celular. Continuar?')) return;
  estado = dados;
  salvarEstado();
  renderizarTudo();
}

// ---------- Instalação ----------

// O navegador só entrega o pedido de instalação (beforeinstallprompt) quando ele mesmo permite instalar;
// fora disso (navegador dentro do WhatsApp, por exemplo) o botão mostra o passo a passo pelo menu.
let pedidoDeInstalacao = null;
const rodandoInstalado = matchMedia('(display-mode: standalone)').matches;
$('#aviso-instalar').hidden = rodandoInstalado || !location.protocol.startsWith('http');

window.addEventListener('beforeinstallprompt', (evento) => {
  evento.preventDefault();
  pedidoDeInstalacao = evento;
});
window.addEventListener('appinstalled', () => {
  $('#aviso-instalar').hidden = true;
});

$('#botao-instalar').addEventListener('click', async () => {
  if (!pedidoDeInstalacao) {
    $('#dialogo-instalar').showModal();
    return;
  }
  pedidoDeInstalacao.prompt();
  const { outcome } = await pedidoDeInstalacao.userChoice;
  if (outcome === 'accepted') $('#aviso-instalar').hidden = true;
  pedidoDeInstalacao = null;
});

// ---------- Inicialização ----------

$('#mes-anterior').addEventListener('click', () => trocarMes(-1));
$('#mes-seguinte').addEventListener('click', () => trocarMes(1));
$('#botao-novo-lancamento').addEventListener('click', () => abrirLancamento(null));
$('#botao-nova-instituicao').addEventListener('click', () => abrirInstituicao(null));
$('#botao-nova-fixa').addEventListener('click', () => abrirFixa(null));
$('#botao-nova-categoria').addEventListener('click', () => abrirCategoria(null));
$('#botao-nova-meta').addEventListener('click', () => abrirMeta(null));
$('#botao-exportar').addEventListener('click', exportarBackup);
$('#botao-importar').addEventListener('click', () => $('#arquivo-importar').click());
$('#arquivo-importar').addEventListener('change', (evento) => {
  const [arquivo] = evento.target.files;
  if (arquivo) importarBackup(arquivo);
  evento.target.value = '';
});
for (const aba of document.querySelectorAll('.aba')) aba.addEventListener('click', () => trocarTela(aba.dataset.tela));
for (const filtro of document.querySelectorAll('.filtro')) {
  filtro.addEventListener('click', () => {
    filtroLancamentos = filtro.dataset.filtro;
    renderizarLancamentos();
  });
}

for (const [nome] of INSTITUICOES_CONHECIDAS) {
  const opcao = document.createElement('option');
  opcao.value = nome;
  $('#sugestoes-instituicoes').append(opcao);
}

// Pede ao navegador para não apagar os dados quando faltar espaço no celular.
navigator.storage?.persist?.();
// O modo offline só existe na versão publicada; o HTML único aberto como arquivo não tem sw.js ao lado.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');

trocarTela('inicio');
renderizarTudo();
