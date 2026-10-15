import {
  formatarMoeda, centavosParaTexto, lerValorEmCentavos, hojeISO, mesDe, somarMeses, dataNoMes, nomeDoMes, nomeDoDia,
  gerarParcelasDoCartao, chaveFatura, lancamentosDoMes, totalDaFatura, resumoDoMes, faltaPagarDaFatura, contasQueRendem,
  gastosPorCategoria, lancamentosDasFixas, valorMensalParaMeta, rendimentoDaInstituicao, guardadoNoFimDoMes,
  gastosDoMes, planoDoMes, dicasDoMes, caixinhasDaInstituicao, saldoComRendimento, totalDaInstituicao, rendeuNoMes,
  resumoDaInstituicaoNoMes,
} from './calculos.js';
import { falar } from './mensagens.js';

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
let instituicaoAberta = null;
const emEdicao = { lancamento: null, instituicao: null, caixinha: null, fixa: null, categoria: null };

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
    cdiAnual: null,
    caixinhas: [],
    percentualGuardar: 10,
    valoresFaturasPagas: {},
    tom: 'zoeira',
  };
}

// Dados salvos antes das caixinhas e da meta de guardar não têm esses campos; completa sem mexer no resto.
function normalizarEstado(dados) {
  dados.caixinhas ??= [];
  dados.percentualGuardar ??= 10;
  dados.valoresFaturasPagas ??= {};
  dados.tom ??= 'zoeira';
  return dados;
}

function carregarEstado() {
  const salvo = localStorage.getItem(CHAVE_ARMAZENAMENTO);
  return salvo ? normalizarEstado(JSON.parse(salvo)) : estadoInicial();
}

function salvarEstado() {
  localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(estado));
}

const buscarCategoria = (id) => estado.categorias.find((categoria) => categoria.id === id);
const buscarInstituicao = (id) => estado.instituicoes.find((instituicao) => instituicao.id === id);
const buscarCaixinha = (id) => estado.caixinhas.find((caixinha) => caixinha.id === id);

// Lançamentos e transferências apontam para uma instituição ou para uma caixinha pelo mesmo campo.
function nomeDaConta(id) {
  const caixinha = buscarCaixinha(id);
  if (caixinha) return `${buscarInstituicao(caixinha.instituicaoId)?.nome ?? ''} · ${caixinha.nome}`;
  return buscarInstituicao(id)?.nome ?? '';
}

function corDaConta(id) {
  const caixinha = buscarCaixinha(id);
  return buscarInstituicao(caixinha ? caixinha.instituicaoId : id)?.cor ?? '#64748b';
}

// ---------- Falar com a pessoa ----------

// Textos fixos da tela sorteiam pela data: mudam de um dia para o outro, não a cada toque.
const sorteioDoDia = () => Number(hojeISO().replaceAll('-', ''));
const dizer = (chave, valores) => falar(estado.tom, chave, valores, sorteioDoDia());

let temporizadorDoAviso = null;
let avisouNestaAcao = false;
function avisar(chave, valores) {
  avisouNestaAcao = true;
  const aviso = $('#aviso-rapido');
  aviso.textContent = falar(estado.tom, chave, valores);
  aviso.hidden = false;
  clearTimeout(temporizadorDoAviso);
  temporizadorDoAviso = setTimeout(() => { aviso.hidden = true; }, 4000);
}

function saudacaoDaHora() {
  const hora = new Date().getHours();
  if (hora < 5) return 'saudacao_madrugada';
  if (hora < 12) return 'saudacao_manha';
  if (hora < 18) return 'saudacao_tarde';
  return 'saudacao_noite';
}

// Situação do mês para o comentário embaixo do "Ainda posso gastar".
function situacaoDoMes(plano) {
  if (plano.entradas === 0) return 'situacao_sem_entradas';
  if (plano.podeGastar < 0) return 'situacao_passou';
  const planejado = plano.entradas - plano.metaGuardar;
  if (plano.podeGastar < planejado * 0.15) return 'situacao_apertado';
  if (plano.podeGastar > planejado * 0.5) return 'situacao_sobrando';
  return 'situacao_tranquilo';
}

const VALOR_DE_GASTO_GRANDE = 50000;
const VALOR_DE_GASTO_PEQUENO = 2000;

// Reação ao salvar um lançamento: tamanho do gasto, parcelamento, entrada, guardar ou resgatar da caixinha.
function reagirAoLancamento({ tipo, valor, parcelas, categoriaId, origemId, destinoId }) {
  if (tipo === 'transferencia') {
    const rendem = new Set(contasQueRendem(estado).map((conta) => conta.id));
    if (rendem.has(destinoId) && !rendem.has(origemId)) return avisar('guardou', { valor: formatarMoeda(valor) });
    if (rendem.has(origemId) && !rendem.has(destinoId)) return avisar('resgatou', { valor: formatarMoeda(valor) });
    return avisar('transferiu');
  }
  if (tipo === 'receita') return avisar('entrada', { valor: formatarMoeda(valor) });
  if (parcelas > 1) return avisar('gasto_parcelado', { parcelas, parcela: formatarMoeda(Math.round(valor / parcelas)) });
  const entradasDoMes = planoDoMes(estado, mesVisivel, hojeISO()).entradas;
  const grande = valor >= VALOR_DE_GASTO_GRANDE || (entradasDoMes > 0 && valor > entradasDoMes * 0.1);
  const chave = grande ? 'gasto_grande' : (valor < VALOR_DE_GASTO_PEQUENO ? 'gasto_pequeno' : 'gasto_medio');
  avisar(chave, { valor: formatarMoeda(valor), categoria: buscarCategoria(categoriaId)?.nome ?? '' });
}

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
  if (lancamento.tipo === 'transferencia') return `⇄ ${formatarMoeda(lancamento.valor)}`;
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
    const acao = evento.submitter?.value ?? 'salvar';
    avisouNestaAcao = false;
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
    // Reação padrão quando o formulário não tem uma reação própria.
    if (!avisouNestaAcao) avisar(acao === 'excluir' ? 'excluiu' : 'salvo');
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
  // reset() não limpa mensagens de erro: sem isso, um erro de um uso anterior bloquearia o próximo envio.
  for (const campo of dialogo.querySelector('form').elements) campo.setCustomValidity?.('');
  dialogo.showModal();
}

// ---------- Navegação ----------

// Aba, mês e instituição aberta ficam no endereço (#graficos/2026-11, #instituicao/2026-11/<id>)
// para recarregar sem voltar ao Início. Abrir pelo ícone usa o endereço sem # e começa no Início do mês atual.
const TELAS = ['inicio', 'lancamentos', 'graficos', 'ajustes', 'instituicao'];

function guardarNoEndereco() {
  const tela = document.body.dataset.tela;
  history.replaceState(null, '', tela === 'instituicao' ? `#${tela}/${mesVisivel}/${instituicaoAberta}` : `#${tela}/${mesVisivel}`);
}

function lerDoEndereco() {
  const [tela, mes, id] = location.hash.slice(1).split('/');
  const instituicaoValida = tela === 'instituicao' && buscarInstituicao(id);
  return {
    tela: TELAS.includes(tela) && (tela !== 'instituicao' || instituicaoValida) ? tela : 'inicio',
    mes: /^\d{4}-\d{2}$/.test(mes ?? '') ? mes : null,
    instituicaoId: instituicaoValida ? id : null,
  };
}

function trocarTela(nomeTela) {
  document.body.dataset.tela = nomeTela;
  guardarNoEndereco();
  const abaDestacada = nomeTela === 'instituicao' ? 'inicio' : nomeTela;
  for (const tela of document.querySelectorAll('.tela')) tela.classList.toggle('ativa', tela.id === `tela-${nomeTela}`);
  for (const aba of document.querySelectorAll('.aba')) aba.classList.toggle('ativa', aba.dataset.tela === abaDestacada);
  atualizarTitulo();
  window.scrollTo(0, 0);
}

function abrirTelaInstituicao(instituicaoId) {
  instituicaoAberta = instituicaoId;
  renderizarInstituicao();
  trocarTela('instituicao');
}

function atualizarTitulo() {
  const titulos = { ajustes: 'Ajustes' };
  const tela = document.body.dataset.tela;
  const titulo = tela === 'instituicao' ? `${buscarInstituicao(instituicaoAberta)?.nome} · ${nomeDoMes(mesVisivel, { curto: true })}` : titulos[tela];
  $('#titulo-topo').textContent = titulo ?? nomeDoMes(mesVisivel);
}

function trocarMes(quantidade) {
  mesVisivel = somarMeses(mesVisivel, quantidade);
  guardarNoEndereco();
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
  guardarNoEndereco();
  atualizarTitulo();
  renderizarInicio();
  renderizarInstituicao();
  renderizarLancamentos();
  renderizarGraficos();
  renderizarAjustes();
}

const DICAS_NO_INICIO = 3;

function renderizarInicio() {
  const hoje = hojeISO();
  const plano = planoDoMes(estado, mesVisivel, hoje);
  // Sem nenhuma entrada no mês não há planejado para "passar": mostra zero e o comentário pede o salário.
  const semEntradas = plano.entradas === 0;
  const passou = !semEntradas && plano.podeGastar < 0;
  $('#saudacao').textContent = dizer(saudacaoDaHora());
  $('#resumo-comentario').textContent = dizer(situacaoDoMes(plano), { valor: formatarMoeda(Math.abs(plano.podeGastar)) });
  $('#rotulo-pode-gastar').textContent = passou ? 'Passou do planejado' : 'Ainda posso gastar';
  $('#resumo-pode-gastar').textContent = formatarMoeda(semEntradas ? 0 : Math.abs(plano.podeGastar));
  $('#resumo-pode-gastar').classList.toggle('negativo', passou);
  $('#resumo-por-dia').textContent = plano.porDia !== null
    ? `${formatarMoeda(plano.porDia)} por dia nos ${plano.diasRestantes} dias que faltam`
    : '';
  $('#resumo-receitas').textContent = formatarMoeda(plano.entradas);
  $('#resumo-gastos').textContent = formatarMoeda(plano.gastos);
  $('#resumo-guardar').textContent = `${formatarMoeda(Math.max(0, plano.guardado))} de ${formatarMoeda(plano.metaGuardar)}`;
  $('#resumo-total').textContent = formatarMoeda(estado.instituicoes.reduce((soma, i) => soma + totalDaInstituicao(estado, i, hoje), 0));
  $('#resumo-a-pagar').textContent = formatarMoeda(resumoDoMes(estado, mesVisivel).aPagar);

  // Metas da antiga aba Metas não viram caixinha sozinhas (não eram dinheiro de verdade): avisa uma vez para recriar.
  $('#aviso-metas').hidden = estado.metas.length === 0;
  if (estado.metas.length) {
    $('#texto-aviso-metas').textContent = dizer('aviso_metas_antigas', { nomes: estado.metas.map((meta) => `"${meta.nome}"`).join(', ') });
  }

  const listaDicas = $('#lista-dicas');
  listaDicas.replaceChildren();
  for (const { nivel, chave, valores } of dicasDoMes(estado, mesVisivel, hoje).slice(0, DICAS_NO_INICIO)) {
    const item = clonarModelo('modelo-dica');
    item.classList.add(nivel === 'dica' ? 'dica-geral' : nivel);
    preencher(item, { rotulo: dizer(`rotulo_${nivel}`), texto: dizer(`dica_${chave}`, valores) });
    listaDicas.append(item);
  }

  renderizarSaldosDasInstituicoes();
  renderizarContasDoMes();
  renderizarOrcamento();
}

function renderizarSaldosDasInstituicoes() {
  const lista = $('#lista-saldos-instituicoes');
  lista.replaceChildren();
  for (const instituicao of estado.instituicoes) {
    const cartao = clonarModelo('modelo-saldo-instituicao');
    const total = totalDaInstituicao(estado, instituicao, hojeISO());
    const quantidadeDeCaixinhas = caixinhasDaInstituicao(estado, instituicao.id).length;
    const detalhes = [];
    if (instituicao.temCartao) detalhes.push(`Fatura ${formatarMoeda(totalDaFatura(estado.lancamentos, instituicao.id, mesVisivel))}`);
    if (quantidadeDeCaixinhas > 0) detalhes.push(`${quantidadeDeCaixinhas} caixinha${quantidadeDeCaixinhas > 1 ? 's' : ''}`);
    pintarMarcador(cartao, instituicao.cor);
    preencher(cartao, {
      nome: instituicao.nome,
      saldo: formatarMoeda(total),
      detalhe: detalhes.join(' · ') || 'Saldo atual',
    });
    cartao.querySelector('[data-campo="saldo"]').classList.toggle('negativo', total < 0);
    cartao.addEventListener('click', () => abrirTelaInstituicao(instituicao.id));
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
    preencher(item, {
      titulo: lancamento.descricao,
      detalhe: `Dia ${Number(lancamento.data.slice(8))} · ${nomeDaConta(lancamento.instituicaoId)}`,
      valor: valorComSinal(lancamento),
    });
    item.classList.toggle('pago', lancamento.pago);
    item.querySelector('.marcar-pago').addEventListener('click', () => {
      lancamento.pago = !lancamento.pago;
      if (!lancamento.pago) avisar('voltou_pendente');
      else if (lancamento.tipo === 'receita') avisar('entrada', { valor: formatarMoeda(lancamento.valor) });
      else avisar('conta_paga');
      salvarEstado();
      renderizarTudo();
    });
    item.querySelector('.item-texto').addEventListener('click', () => abrirLancamento(lancamento));
    lista.append(item);
  }

  for (const instituicao of estado.instituicoes.filter((i) => i.temCartao)) {
    const total = totalDaFatura(estado.lancamentos, instituicao.id, mesVisivel);
    if (total === 0) continue;
    const falta = faltaPagarDaFatura(estado, instituicao.id, mesVisivel);
    const pagaEmParte = falta > 0 && falta < total;
    const item = clonarModelo('modelo-conta-do-mes');
    preencher(item, {
      titulo: `Fatura ${instituicao.nome}`,
      detalhe: pagaEmParte
        ? `Entrou compra depois de paga · faltam ${formatarMoeda(falta)}`
        : `Vence dia ${instituicao.diaVencimento}`,
      valor: `− ${formatarMoeda(total)}`,
    });
    item.classList.toggle('pago', falta === 0);
    item.querySelector('.marcar-pago').addEventListener('click', () => {
      marcarFatura(instituicao.id, mesVisivel);
      avisar(faltaPagarDaFatura(estado, instituicao.id, mesVisivel) === 0 ? 'fatura_paga' : 'voltou_pendente');
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
  $('#vazio-contas-do-mes').textContent = dizer('vazio_contas');
}

// Toque no círculo da fatura: em aberto → paga (guarda o valor); paga com diferença → paga a diferença; paga → desfaz.
function marcarFatura(instituicaoId, mes) {
  const chave = chaveFatura(instituicaoId, mes);
  const total = totalDaFatura(estado.lancamentos, instituicaoId, mes);
  const jaMarcada = estado.faturasPagas.includes(chave);
  if (jaMarcada && faltaPagarDaFatura(estado, instituicaoId, mes) === 0) {
    estado.faturasPagas = estado.faturasPagas.filter((paga) => paga !== chave);
    delete estado.valoresFaturasPagas[chave];
    return;
  }
  if (!jaMarcada) estado.faturasPagas.push(chave);
  estado.valoresFaturasPagas[chave] = total;
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
  if (lancamento.tipo === 'transferencia') {
    return `${nomeDaConta(lancamento.instituicaoId)} → ${nomeDaConta(lancamento.destinoId)}`;
  }
  const partes = [buscarCategoria(lancamento.categoriaId)?.nome ?? 'Sem categoria'];
  const conta = nomeDaConta(lancamento.instituicaoId);
  if (conta) partes.push(lancamento.credito ? `${conta} crédito` : conta);
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
    lista.append(itemDeLancamento(lancamento));
  }
  $('#vazio-lancamentos').hidden = filtrados.length > 0;
  $('#vazio-lancamentos').textContent = dizer('vazio_lancamentos');
}

function itemDeLancamento(lancamento) {
  const item = clonarModelo('modelo-item');
  pintarMarcador(item, buscarCategoria(lancamento.categoriaId)?.cor ?? '#64748b');
  preencher(item, { titulo: lancamento.descricao, detalhe: detalheDoLancamento(lancamento), valor: valorComSinal(lancamento) });
  item.querySelector('.item-valor').classList.toggle('positivo', lancamento.tipo === 'receita');
  item.addEventListener('click', () => abrirLancamento(lancamento));
  return item;
}

// ---------- Tela da instituição ----------

// Caixinha com meta opcional: a barra e o "guarde R$ X por mês" usam o dinheiro que está nela de verdade (com rendimento).
function itemDeCaixinha(caixinha, hoje) {
  const item = clonarModelo('modelo-caixinha');
  const guardado = saldoComRendimento(estado, caixinha, hoje);
  pintarMarcador(item, 'var(--rendimento)');
  let textoDaMeta = '';
  if (caixinha.meta) {
    const percentual = Math.max(0, Math.min(100, Math.round((guardado / caixinha.meta) * 100)));
    const mensal = valorMensalParaMeta({ alvo: caixinha.meta, guardado, prazo: caixinha.prazo }, mesDe(hoje));
    if (guardado >= caixinha.meta) textoDaMeta = dizer('meta_atingida');
    else if (mensal) textoDaMeta = dizer('meta_mensal', { valor: formatarMoeda(mensal), prazo: nomeDoMes(caixinha.prazo).toLowerCase() });
    else textoDaMeta = dizer('meta_faltam', { valor: formatarMoeda(caixinha.meta - guardado) });
    textoDaMeta = `Meta ${formatarMoeda(caixinha.meta)} · ${percentual}% · ${textoDaMeta}`;
    item.querySelector('.barra-preenchida').style.setProperty('--percentual', `${percentual}%`);
  }
  item.querySelector('.barra-meta').hidden = !caixinha.meta;
  preencher(item, {
    titulo: caixinha.nome,
    detalhe: `${String(caixinha.percentualCdi).replace('.', ',')}% do CDI · rendeu ${formatarMoeda(rendimentoDaInstituicao(estado, caixinha, hoje))}`,
    meta: textoDaMeta,
    valor: formatarMoeda(guardado),
  });
  item.addEventListener('click', () => abrirCaixinha(caixinha));
  return item;
}

function renderizarInstituicao() {
  const instituicao = buscarInstituicao(instituicaoAberta);
  if (!instituicao) {
    if (document.body.dataset.tela === 'instituicao') trocarTela('inicio');
    return;
  }
  const hoje = hojeISO();
  const caixinhas = caixinhasDaInstituicao(estado, instituicao.id);
  const resumo = resumoDaInstituicaoNoMes(estado, instituicao.id, mesVisivel);
  $('#painel-instituicao').style.setProperty('--cor', instituicao.cor);
  $('#inst-total').textContent = formatarMoeda(totalDaInstituicao(estado, instituicao, hoje));
  $('#inst-entradas').textContent = formatarMoeda(resumo.entradas);
  $('#inst-gastos').textContent = formatarMoeda(resumo.gastos);
  $('#inst-rendeu').textContent = formatarMoeda(rendeuNoMes(estado, [instituicao, ...caixinhas], mesVisivel, hoje));

  const rendimentoDaConta = rendimentoDaInstituicao(estado, instituicao, hoje);
  renderizarListaDeAjustes('#inst-conta', [{
    titulo: 'Saldo da conta',
    detalhe: instituicao.percentualCdi
      ? `Rende ${String(instituicao.percentualCdi).replace('.', ',')}% do CDI · rendeu ${formatarMoeda(rendimentoDaConta)}`
      : 'Débito, Pix e transferências',
    valor: formatarMoeda(saldoComRendimento(estado, instituicao, hoje)),
    cor: instituicao.cor,
    origem: instituicao,
  }], abrirInstituicao);

  $('#inst-caixinhas').replaceChildren(...caixinhas.map((caixinha) => itemDeCaixinha(caixinha, hoje)));
  $('#inst-vazio-caixinhas').hidden = caixinhas.length > 0;
  $('#inst-botoes-caixinha').hidden = caixinhas.length === 0;

  $('#inst-secao-cartao').hidden = !instituicao.temCartao;
  if (instituicao.temCartao) {
    const falta = faltaPagarDaFatura(estado, instituicao.id, mesVisivel);
    const semCompras = totalDaFatura(estado.lancamentos, instituicao.id, mesVisivel) === 0;
    const situacaoDaFatura = semCompras ? 'sem compras' : (falta === 0 ? 'paga' : `falta pagar ${formatarMoeda(falta)}`);
    renderizarListaDeAjustes('#inst-cartao', [{
      titulo: `Fatura de ${nomeDoMes(mesVisivel, { curto: true })}`,
      detalhe: `Fecha dia ${instituicao.diaFechamento}, vence dia ${instituicao.diaVencimento} · ${situacaoDaFatura}`,
      valor: formatarMoeda(totalDaFatura(estado.lancamentos, instituicao.id, mesVisivel)),
      cor: instituicao.cor,
      origem: null,
    }], () => {
      filtroLancamentos = 'credito';
      trocarTela('lancamentos');
      renderizarLancamentos();
    });
  }

  const meses = Array.from({ length: 6 }, (_, indice) => somarMeses(mesVisivel, indice - 5));
  montarGraficoGuardado($('#guardado-instituicao'), [instituicao, ...caixinhas].filter((conta) => conta.percentualCdi), meses);

  const barras = $('#inst-barras');
  barras.replaceChildren();
  const resumos = meses.map((mes) => resumoDaInstituicaoNoMes(estado, instituicao.id, mes));
  const maior = Math.max(1, ...resumos.flatMap((r) => [r.entradas, r.gastos]));
  meses.forEach((mes, indice) => {
    const barra = clonarModelo('modelo-barra-mes');
    barra.querySelector('.coluna-receita').style.setProperty('--altura', `${(resumos[indice].entradas / maior) * 100}%`);
    barra.querySelector('.coluna-despesa').style.setProperty('--altura', `${(resumos[indice].gastos / maior) * 100}%`);
    preencher(barra, { mes: nomeDoMes(mes, { curto: true }) });
    barra.classList.toggle('atual', mes === mesVisivel);
    barras.append(barra);
  });

  const idsDaInstituicao = new Set([instituicao.id, ...caixinhas.map((caixinha) => caixinha.id)]);
  const lancamentos = lancamentosDoMes(estado.lancamentos, mesVisivel)
    .filter((l) => idsDaInstituicao.has(l.instituicaoId) || idsDaInstituicao.has(l.destinoId))
    .sort((a, b) => b.data.localeCompare(a.data));
  const lista = $('#inst-lancamentos');
  lista.replaceChildren(...lancamentos.map(itemDeLancamento));
  $('#inst-vazio-lancamentos').hidden = lancamentos.length > 0;
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
  const resumos = meses.map((mes) => ({ receitas: resumoDoMes(estado, mes).receitas, gastos: gastosDoMes(estado.lancamentos, mes) }));
  const maior = Math.max(1, ...resumos.flatMap((resumo) => [resumo.receitas, resumo.gastos]));
  meses.forEach((mes, indice) => {
    const barra = clonarModelo('modelo-barra-mes');
    barra.querySelector('.coluna-receita').style.setProperty('--altura', `${(resumos[indice].receitas / maior) * 100}%`);
    barra.querySelector('.coluna-despesa').style.setProperty('--altura', `${(resumos[indice].gastos / maior) * 100}%`);
    preencher(barra, { mes: nomeDoMes(mes, { curto: true }) });
    barra.classList.toggle('atual', mes === mesVisivel);
    barras.append(barra);
  });

  const contas = contasQueRendem(estado);
  montarGraficoGuardado($('#guardado-geral'), contas, meses);
  $('#vazio-guardado').hidden = contas.length > 0;
}

// Gráfico "dinheiro guardado" (depositado + rendimento no fim de cada mês). Usado em Gráficos, com todas as contas que
// rendem, e na tela de cada banco, só com as dele; sem contas, o container fica vazio.
function montarGraficoGuardado(container, contas, meses) {
  container.replaceChildren();
  if (contas.length === 0) return;
  const hoje = hojeISO();
  const posicoes = meses.map((mes) => guardadoNoFimDoMes(estado, mes, hoje, contas));
  const atual = posicoes.at(-1);
  const bloco = clonarModelo('modelo-bloco-guardado');
  preencher(bloco, {
    total: formatarMoeda(atual.depositado + atual.rendimento),
    rendeuTotal: formatarMoeda(atual.rendimento),
    // Mesma conta da tela da instituição, para os dois "Rendeu no mês" sempre baterem.
    rendeuMes: formatarMoeda(rendeuNoMes(estado, contas, mesVisivel, hoje)),
    detalhe: estado.cdiAnual ? 'Toque numa barra para ver os valores.' : 'Informe o CDI em Ajustes para ver o rendimento.',
  });
  const barras = bloco.querySelector('[data-barras]');
  const detalhe = bloco.querySelector('[data-campo="detalhe"]');
  const maior = Math.max(1, ...posicoes.map((posicao) => posicao.depositado + posicao.rendimento));
  meses.forEach((mes, indice) => {
    const { depositado, rendimento } = posicoes[indice];
    const total = Math.max(0, depositado + rendimento);
    const previsao = mes > mesDe(hoje);
    const barra = clonarModelo('modelo-barra-guardado');
    barra.querySelector('.pilha').style.setProperty('--altura', `${(total / maior) * 100}%`);
    const segmentoDepositado = barra.querySelector('.segmento-depositado');
    const segmentoRendimento = barra.querySelector('.segmento-rendimento');
    segmentoDepositado.style.setProperty('--parte', Math.max(0, depositado));
    segmentoRendimento.style.setProperty('--parte', Math.max(0, rendimento));
    segmentoRendimento.hidden = rendimento <= 0;
    segmentoDepositado.hidden = depositado <= 0;
    preencher(barra, { mes: nomeDoMes(mes, { curto: true }) });
    barra.classList.toggle('previsao', previsao);
    barra.setAttribute('aria-label', `${nomeDoMes(mes)}: ${formatarMoeda(total)}`);
    barra.addEventListener('click', () => {
      for (const outra of barras.children) outra.classList.toggle('selecionada', outra === barra);
      detalhe.textContent = `${nomeDoMes(mes)}${previsao ? ' (previsão)' : ''}: ${formatarMoeda(depositado)} depositado + `
        + `${formatarMoeda(rendimento)} de rendimento = ${formatarMoeda(depositado + rendimento)}`;
    });
    barras.append(barra);
  });
  container.append(bloco);
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
    detalhe: [
      instituicao.temCartao ? `Cartão: fecha dia ${instituicao.diaFechamento}, vence dia ${instituicao.diaVencimento}` : null,
      !instituicao.temCartao && !instituicao.percentualCdi ? 'Sem cartão' : null,
      instituicao.percentualCdi ? `Rende ${String(instituicao.percentualCdi).replace('.', ',')}% do CDI` : null,
      caixinhasDaInstituicao(estado, instituicao.id).length ? `${caixinhasDaInstituicao(estado, instituicao.id).length} caixinha(s)` : null,
    ].filter(Boolean).join(' · '),
    cor: instituicao.cor,
    origem: instituicao,
  })), (instituicao) => abrirTelaInstituicao(instituicao.id));

  const campoCdi = $('#campo-cdi');
  if (document.activeElement !== campoCdi) campoCdi.value = estado.cdiAnual ? String(estado.cdiAnual).replace('.', ',') : '';
  $(`#escolha-tom input[value="${estado.tom}"]`).checked = true;
  const campoGuardar = $('#campo-guardar');
  if (document.activeElement !== campoGuardar) campoGuardar.value = String(estado.percentualGuardar).replace('.', ',');

  renderizarListaDeAjustes('#lista-fixas', estado.fixas.map((fixa) => ({
    titulo: fixa.descricao,
    detalhe: `Todo dia ${fixa.dia} · ${nomeDaConta(fixa.instituicaoId)}`,
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

// Caixinha só aparece em transferência: gastar ou receber direto nela não é como os bancos funcionam.
function opcoesDePagamento(tipo) {
  const opcoes = [];
  for (const instituicao of estado.instituicoes) {
    opcoes.push({ valor: `${instituicao.id}|conta`, nome: instituicao.nome, cor: instituicao.cor });
    if (tipo === 'despesa' && instituicao.temCartao) {
      opcoes.push({ valor: `${instituicao.id}|credito`, nome: `${instituicao.nome} crédito`, cor: instituicao.cor });
    }
    if (tipo === 'transferencia') {
      for (const caixinha of caixinhasDaInstituicao(estado, instituicao.id)) {
        opcoes.push({ valor: `${caixinha.id}|conta`, nome: nomeDaConta(caixinha.id), cor: instituicao.cor });
      }
    }
  }
  return opcoes;
}

function atualizarFormLancamento({ categoriaId, pagamento, destinoId } = {}) {
  const tipo = formLancamento.tipo.value;
  const transferencia = tipo === 'transferencia';
  const categoriaAtual = categoriaId ?? formLancamento.querySelector('input[name="categoriaId"]:checked')?.value;
  const pagamentoAtual = pagamento ?? formLancamento.querySelector('input[name="pagamento"]:checked')?.value;
  const destinoAtual = destinoId ?? formLancamento.querySelector('input[name="destinoId"]:checked')?.value;
  montarChips(formLancamento.querySelector('[data-chips="categoriaId"]'), 'categoriaId', transferencia ? [] : opcoesDeCategoria(tipo), categoriaAtual);
  const opcoesPagamento = opcoesDePagamento(tipo);
  // Entrada ou gasto antigo lançado direto numa caixinha (antes de ela ir para dentro da instituição):
  // ao editar, mantém a caixinha como opção para não trocar a conta dele sem querer.
  const caixinhaDoLancamento = emEdicao.lancamento && buscarCaixinha(pagamentoAtual?.split('|')[0]);
  if (caixinhaDoLancamento && !opcoesPagamento.some((opcao) => opcao.valor === pagamentoAtual)) {
    opcoesPagamento.push({ valor: pagamentoAtual, nome: nomeDaConta(caixinhaDoLancamento.id), cor: corDaConta(caixinhaDoLancamento.id) });
  }
  const pagamentoValido = opcoesPagamento.some((opcao) => opcao.valor === pagamentoAtual) ? pagamentoAtual : opcoesPagamento[0]?.valor;
  montarChips(formLancamento.querySelector('[data-chips="pagamento"]'), 'pagamento', opcoesPagamento, pagamentoValido);

  // O destino não pode ser a própria conta de origem.
  const opcoesDestino = transferencia
    ? opcoesDePagamento('transferencia')
      .map((opcao) => ({ ...opcao, valor: opcao.valor.replace('|conta', '') }))
      .filter((opcao) => `${opcao.valor}|conta` !== pagamentoValido)
    : [];
  const destinoValido = opcoesDestino.some((opcao) => opcao.valor === destinoAtual) ? destinoAtual : opcoesDestino[0]?.valor;
  montarChips(formLancamento.querySelector('[data-chips="destinoId"]'), 'destinoId', opcoesDestino, destinoValido);

  const rotulosInstituicao = { despesa: 'Pagou com', receita: 'Recebeu em', transferencia: 'De' };
  formLancamento.querySelector('[data-rotulo-instituicao]').textContent = rotulosInstituicao[tipo];
  formLancamento.querySelector('[data-rotulo-pago]').textContent = tipo === 'receita' ? 'Já recebido' : 'Já pago';
  formLancamento.querySelector('[data-sem-transferencia]').hidden = transferencia;
  formLancamento.querySelector('[data-somente-transferencia]').hidden = !transferencia;
  formLancamento.descricao.required = !transferencia;
  formLancamento.descricao.placeholder = transferencia ? 'Opcional' : 'Ex.: Mercado';
  atualizarCamposDeCredito();
}

function atualizarCamposDeCredito() {
  const credito = formLancamento.querySelector('input[name="pagamento"]:checked')?.value.endsWith('|credito') ?? false;
  const transferencia = formLancamento.tipo.value === 'transferencia';
  formLancamento.querySelector('[data-somente-credito]').hidden = !credito;
  formLancamento.querySelector('[data-sem-credito]').hidden = credito || transferencia;
}

// preenchimento: tipo, pagamento e destino já escolhidos (ex.: botão Guardar abre a transferência conta → caixinha).
function abrirLancamento(lancamento, preenchimento = {}) {
  emEdicao.lancamento = lancamento;
  formLancamento.reset();
  const tipo = lancamento?.tipo ?? preenchimento.tipo ?? 'despesa';
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
    pagamento: lancamento ? `${lancamento.instituicaoId}|${lancamento.credito ? 'credito' : 'conta'}` : (preenchimento.pagamento ?? estado.ultimoPagamento),
    destinoId: lancamento?.destinoId ?? preenchimento.destinoId ?? null,
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

    if (dados.get('tipo') === 'transferencia') {
      const destinoId = dados.get('destinoId');
      if (!destinoId) return falharCampo(form.querySelector('input[name="pagamento"]'), 'Cadastre outra instituição para poder transferir.');
      if (original) removerLancamento(original);
      estado.lancamentos.push({
        id: original?.id ?? criarId(),
        tipo: 'transferencia',
        valor,
        data: dados.get('data'),
        descricao: dados.get('descricao').trim() || 'Transferência',
        instituicaoId,
        destinoId,
        credito: false,
        pago: true,
      });
      estado.ultimoPagamento = dados.get('pagamento');
      reagirAoLancamento({ tipo: 'transferencia', valor, origemId: instituicaoId, destinoId });
      return null;
    }

    const base = {
      tipo: dados.get('tipo'),
      descricao: dados.get('descricao').trim(),
      categoriaId: dados.get('categoriaId'),
      instituicaoId,
    };
    if (original) removerLancamento(original);

    const parcelas = forma === 'credito' ? Math.max(1, Math.min(48, Number(dados.get('parcelas')) || 1)) : 1;
    reagirAoLancamento({ tipo: base.tipo, valor, parcelas, categoriaId: base.categoriaId });
    if (forma === 'credito') {
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
  // Lançamento novo com data futura nasce "a pagar"; com data de hoje ou antes, "já pago".
  if (evento.target.name === 'data' && !emEdicao.lancamento) formLancamento.pago.checked = formLancamento.data.value <= hojeISO();
  if (evento.target.name === 'pagamento') {
    if (formLancamento.tipo.value === 'transferencia') atualizarFormLancamento();
    else atualizarCamposDeCredito();
  }
});

// ---------- Instituição ----------

const formInstituicao = $('#form-instituicao');

function atualizarCamposDeCartao() {
  formInstituicao.querySelector('[data-somente-cartao]').hidden = !formInstituicao.temCartao.checked;
  formInstituicao.querySelector('[data-somente-cdi]').hidden = !formInstituicao.rendeCdi.checked;
  // Para instituições criadas no modelo antigo só para fazer papel de caixinha (sem cartão).
  const podeVirarCaixinha = Boolean(emEdicao.instituicao) && formInstituicao.moverPara.options.length > 1
    && !formInstituicao.temCartao.checked;
  formInstituicao.querySelector('[data-somente-mover]').hidden = !podeVirarCaixinha;
  if (!podeVirarCaixinha) formInstituicao.moverPara.value = '';
}

// Aceita "13,65" ou "13.65"; null para vazio ou inválido.
function lerPercentual(texto) {
  const numero = Number(String(texto ?? '').trim().replace(',', '.'));
  return String(texto ?? '').trim() !== '' && Number.isFinite(numero) && numero > 0 ? numero : null;
}

function abrirInstituicao(instituicao) {
  emEdicao.instituicao = instituicao;
  formInstituicao.reset();
  const nenhuma = new Option('Não, é uma instituição', '');
  const outras = estado.instituicoes.filter((outra) => outra !== instituicao).map((outra) => new Option(outra.nome, outra.id));
  formInstituicao.moverPara.replaceChildren(nenhuma, ...outras);
  if (instituicao) {
    formInstituicao.nome.value = instituicao.nome;
    formInstituicao.saldoInicial.value = centavosParaTexto(instituicao.saldoInicial);
    formInstituicao.temCartao.checked = instituicao.temCartao;
    formInstituicao.diaFechamento.value = instituicao.diaFechamento ?? '';
    formInstituicao.diaVencimento.value = instituicao.diaVencimento ?? '';
    formInstituicao.rendeCdi.checked = Boolean(instituicao.percentualCdi);
    if (instituicao.percentualCdi) formInstituicao.percentualCdi.value = String(instituicao.percentualCdi).replace('.', ',');
    formInstituicao.cor.value = instituicao.cor;
  }
  atualizarCamposDeCartao();
  abrirDialogo('dialogo-instituicao', { titulo: instituicao ? 'Editar instituição' : 'Nova instituição', editando: Boolean(instituicao) });
}

formInstituicao.temCartao.addEventListener('change', atualizarCamposDeCartao);
formInstituicao.rendeCdi.addEventListener('change', atualizarCamposDeCartao);
// Caixinha sempre rende: ao escolher virar caixinha, já liga o % do CDI (100% se ainda não tinha).
formInstituicao.moverPara.addEventListener('change', () => {
  if (formInstituicao.moverPara.value) formInstituicao.rendeCdi.checked = true;
  atualizarCamposDeCartao();
});

$('#escolha-tom').addEventListener('change', (evento) => {
  estado.tom = evento.target.value;
  salvarEstado();
  renderizarTudo();
  avisar('salvo');
});

$('#campo-guardar').addEventListener('change', (evento) => {
  const texto = evento.target.value.trim();
  const percentual = Number((texto || '0').replace(',', '.'));
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    evento.target.setCustomValidity('Informe um percentual de 0 a 100, ex.: 10.');
    evento.target.reportValidity();
    return;
  }
  evento.target.setCustomValidity('');
  estado.percentualGuardar = percentual;
  salvarEstado();
  renderizarTudo();
});

$('#campo-cdi').addEventListener('change', (evento) => {
  const texto = evento.target.value.trim();
  const cdi = lerPercentual(texto);
  if (texto !== '' && cdi === null) {
    evento.target.setCustomValidity('Informe o CDI em % ao ano, ex.: 13,65.');
    evento.target.reportValidity();
    return;
  }
  evento.target.setCustomValidity('');
  estado.cdiAnual = cdi;
  salvarEstado();
  renderizarTudo();
});

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
    const rendeCdi = dados.get('rendeCdi') === 'on';
    const percentualCdi = rendeCdi ? lerPercentual(dados.get('percentualCdi')) : null;
    if (rendeCdi && !(percentualCdi !== null && percentualCdi <= 300)) return falharCampo(form.percentualCdi, 'Informe o % do CDI, ex.: 100.');
    const original = emEdicao.instituicao;
    if (original?.temCartao && !temCartao && estado.lancamentos.some((l) => l.credito && l.instituicaoId === original.id)) {
      return falharCampo(form.temCartao, 'Há compras no crédito desta instituição. Exclua-as antes de tirar o cartão.');
    }

    const moverPara = dados.get('moverPara');
    if (original && moverPara) {
      if (caixinhasDaInstituicao(estado, original.id).length) return falharCampo(form.moverPara, 'Ela tem caixinhas próprias e não pode virar caixinha.');
      if (!percentualCdi) return falharCampo(form.rendeCdi, 'Caixinha precisa render: marque "A conta rende % do CDI".');
      // Mesmo id: transferências e entradas já lançadas nela continuam apontando para ela, agora como caixinha,
      // e o saldo não muda (saldo e rendimento são calculados pelo id, seja instituição ou caixinha).
      estado.caixinhas.push({
        id: original.id,
        instituicaoId: moverPara,
        nome: dados.get('nome').trim(),
        percentualCdi,
        saldoInicial,
        saldoEm: saldoInicial === original.saldoInicial ? original.saldoEm : hojeISO(),
        rendeDesde: original.rendeDesde ?? hojeISO(),
      });
      estado.instituicoes = estado.instituicoes.filter((i) => i.id !== original.id);
      if (instituicaoAberta === original.id) instituicaoAberta = moverPara;
      return null;
    }
    const dadosInstituicao = {
      nome: dados.get('nome').trim(),
      cor: dados.get('cor'),
      saldoInicial,
      // "Saldo na conta hoje": guarda a data para não descontar de novo lançamentos anteriores já embutidos nele.
      saldoEm: original && saldoInicial === original.saldoInicial ? original.saldoEm : hojeISO(),
      temCartao,
      diaFechamento: temCartao ? diaFechamento : null,
      diaVencimento: temCartao ? diaVencimento : null,
      percentualCdi,
      // O rendimento conta a partir do dia em que foi ligado; mudar só o % não reinicia a contagem.
      rendeDesde: rendeCdi ? (original?.rendeDesde ?? hojeISO()) : null,
    };
    if (original) Object.assign(original, dadosInstituicao);
    else {
      estado.instituicoes.push({ id: criarId(), ...dadosInstituicao });
      avisar('instituicao_criada', { nome: dadosInstituicao.nome });
    }
    return null;
  },
  aoExcluir() {
    const instituicao = emEdicao.instituicao;
    const emUso = estado.lancamentos.some((l) => l.instituicaoId === instituicao.id || l.destinoId === instituicao.id)
      || estado.fixas.some((f) => f.instituicaoId === instituicao.id)
      || caixinhasDaInstituicao(estado, instituicao.id).length > 0;
    if (emUso) {
      alert('Esta instituição tem lançamentos, contas fixas ou caixinhas. Exclua ou mude esses itens antes.');
      return false;
    }
    if (estado.instituicoes.length === 1) {
      alert('Precisa existir pelo menos uma instituição (pode ser "Dinheiro") para lançar gastos e entradas.');
      return false;
    }
    if (!confirm(`Excluir ${instituicao.nome}?`)) return false;
    estado.instituicoes = estado.instituicoes.filter((i) => i.id !== instituicao.id);
    return true;
  },
});

// ---------- Caixinha ----------

const formCaixinha = $('#form-caixinha');

function abrirCaixinha(caixinha) {
  emEdicao.caixinha = caixinha;
  formCaixinha.reset();
  if (caixinha) {
    formCaixinha.nome.value = caixinha.nome;
    formCaixinha.percentualCdi.value = String(caixinha.percentualCdi).replace('.', ',');
    formCaixinha.saldoInicial.value = caixinha.saldoInicial ? centavosParaTexto(caixinha.saldoInicial) : '';
    formCaixinha.meta.value = caixinha.meta ? centavosParaTexto(caixinha.meta) : '';
    formCaixinha.prazo.value = caixinha.prazo ?? '';
  }
  abrirDialogo('dialogo-caixinha', { titulo: caixinha ? 'Editar caixinha' : 'Nova caixinha', editando: Boolean(caixinha) });
}

ligarDialogo('dialogo-caixinha', {
  aoSalvar(dados, form) {
    const percentualCdi = lerPercentual(dados.get('percentualCdi'));
    if (!(percentualCdi !== null && percentualCdi <= 300)) return falharCampo(form.percentualCdi, 'Informe o % do CDI, ex.: 100.');
    const saldoInicial = dados.get('saldoInicial').trim() === '' ? 0 : lerValorEmCentavos(dados.get('saldoInicial'));
    if (saldoInicial === null) return falharCampo(form.saldoInicial, 'Valor inválido.');
    const meta = dados.get('meta').trim() === '' ? null : lerValorEmCentavos(dados.get('meta'));
    if (meta === 0 || (dados.get('meta').trim() !== '' && meta === null)) return falharCampo(form.meta, 'Valor inválido. Deixe vazio se não quiser meta.');
    const original = emEdicao.caixinha;
    const dadosCaixinha = {
      nome: dados.get('nome').trim(),
      percentualCdi,
      saldoInicial,
      meta,
      prazo: meta ? (dados.get('prazo') || null) : null,
      saldoEm: original && saldoInicial === original.saldoInicial ? original.saldoEm : hojeISO(),
    };
    if (original) Object.assign(original, dadosCaixinha);
    else {
      estado.caixinhas.push({ id: criarId(), instituicaoId: instituicaoAberta, rendeDesde: hojeISO(), ...dadosCaixinha });
      avisar('caixinha_criada');
    }
    return null;
  },
  aoExcluir() {
    const caixinha = emEdicao.caixinha;
    if (estado.lancamentos.some((l) => l.instituicaoId === caixinha.id || l.destinoId === caixinha.id)) {
      alert('Esta caixinha tem transferências. Resgate o dinheiro e exclua as transferências antes.');
      return false;
    }
    if (!confirm(`Excluir a caixinha ${caixinha.nome}?`)) return false;
    estado.caixinhas = estado.caixinhas.filter((c) => c.id !== caixinha.id);
    return true;
  },
});

function guardarOuResgatar(guardar) {
  const [primeiraCaixinha] = caixinhasDaInstituicao(estado, instituicaoAberta);
  abrirLancamento(null, guardar
    ? { tipo: 'transferencia', pagamento: `${instituicaoAberta}|conta`, destinoId: primeiraCaixinha.id }
    : { tipo: 'transferencia', pagamento: `${primeiraCaixinha.id}|conta`, destinoId: instituicaoAberta });
}

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
    const original = emEdicao.categoria;
    const emUso = original && (estado.lancamentos.some((l) => l.categoriaId === original.id) || estado.fixas.some((f) => f.categoriaId === original.id));
    if (emUso && tipo !== original.tipo) {
      return falharCampo(form.querySelector('input[name="tipo"]'), 'Esta categoria já tem lançamentos; não dá para trocar entre saída e entrada.');
    }
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

// ---------- Backup ----------

function exportarBackup() {
  const arquivo = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(arquivo);
  link.download = `financas-backup-${hojeISO()}.json`;
  link.click();
  // Liberar o arquivo na hora cancela o download em alguns navegadores (Chrome e Safari); espera ele começar.
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  avisar('backup_exportado');
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
  estado = normalizarEstado(dados);
  salvarEstado();
  renderizarTudo();
  avisar('backup_importado');
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

// ---------- Atualização automática ----------

// O Android deixa o app aberto em segundo plano; ao voltar, a tela é a mesma de antes e nada novo é baixado.
// Recarregar depois de um tempo fora traz a versão publicada. Com formulário aberto não recarrega, para não perder o que foi digitado.
const MINUTOS_FORA_PARA_RECARREGAR = 10;
let saiuDoAppEm = null;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saiuDoAppEm = Date.now();
    return;
  }
  const minutosFora = saiuDoAppEm ? (Date.now() - saiuDoAppEm) / 60000 : 0;
  const formularioAberto = document.querySelector('dialog[open]');
  if (minutosFora >= MINUTOS_FORA_PARA_RECARREGAR && !formularioAberto) location.reload();
});

// ---------- Inicialização ----------

$('#mes-anterior').addEventListener('click', () => trocarMes(-1));
$('#mes-seguinte').addEventListener('click', () => trocarMes(1));
// Dentro de uma instituição, o + já vem com ela escolhida.
$('#botao-novo-lancamento').addEventListener('click', () => abrirLancamento(null,
  document.body.dataset.tela === 'instituicao' ? { pagamento: `${instituicaoAberta}|conta` } : {}));
$('#botao-voltar').addEventListener('click', () => trocarTela('inicio'));
$('#botao-entendi-metas').addEventListener('click', () => {
  estado.metas = [];
  salvarEstado();
  renderizarTudo();
});
$('#botao-editar-instituicao').addEventListener('click', () => abrirInstituicao(buscarInstituicao(instituicaoAberta)));
$('#botao-nova-caixinha').addEventListener('click', () => abrirCaixinha(null));
$('#botao-guardar').addEventListener('click', () => guardarOuResgatar(true));
$('#botao-resgatar').addEventListener('click', () => guardarOuResgatar(false));
$('#botao-nova-instituicao').addEventListener('click', () => abrirInstituicao(null));
$('#botao-nova-fixa').addEventListener('click', () => abrirFixa(null));
$('#botao-nova-categoria').addEventListener('click', () => abrirCategoria(null));
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

const enderecoInicial = lerDoEndereco();
if (enderecoInicial.mes) mesVisivel = enderecoInicial.mes;
instituicaoAberta = enderecoInicial.instituicaoId;
trocarTela(enderecoInicial.tela);
renderizarTudo();
