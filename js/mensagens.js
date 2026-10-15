// Tudo o que o app "fala" com a pessoa, nos dois jeitos de falar (Ajustes → Jeito de falar).
// 'zoeira': debochado e com palavrão, a pedido do dono do app, para chamar atenção; 'normal': direto e educado.
// Cada chave pode ter várias versões; {nome} é trocado pelo valor correspondente.

const TEXTOS = {
  zoeira: {
    saudacao_madrugada: [
      'Acordado essa hora mexendo em dinheiro? Vai dormir, caralho. Mas antes olha isso aqui.',
      'Madrugada e você aqui contando moeda. Insônia de pobre é foda.',
    ],
    saudacao_manha: [
      'Bom dia, seu liso. Bora ver quanto ainda dá pra torrar?',
      'Bom dia! Café tomado? Então encara o estrago aí embaixo.',
    ],
    saudacao_tarde: [
      'Boa tarde, mão aberta. O resumo da desgraça tá aí.',
      'Boa tarde! Antes do lanchinho de R$ 30, dá uma olhada nisso.',
    ],
    saudacao_noite: [
      'Boa noite. Antes de pedir iFood, olha isso aqui, porra.',
      'Boa noite! Hora de ver o que você aprontou hoje.',
    ],

    situacao_sem_entradas: ['Sem salário cadastrado eu não faço milagre, porra. Cadastra lá em Ajustes → Contas fixas.'],
    situacao_passou: [
      'Fudeu. Você já passou {valor} do que podia. Fecha essa carteira AGORA.',
      'Estourou, campeão. {valor} além do planejado. Bora de miojo até o fim do mês.',
    ],
    situacao_apertado: [
      'Tá no osso, hein. Segura a onda até o mês virar.',
      'Sobrou pouco. Nada de "só um docinho", entendeu?',
    ],
    situacao_tranquilo: [
      'Tá tranquilo, mas não vai sair comprando merda por aí.',
      'Tudo nos conformes. Por enquanto.',
    ],
    situacao_sobrando: [
      'Tá sobrando grana, seu sortudo do caralho. Que tal guardar mais um pouco?',
      'Olha só quem tá com dinheiro! Joga uma parte na caixinha antes que suma.',
    ],

    gasto_pequeno: [
      'Mais {valor} em {categoria}. De pouquinho em pouquinho o rombo cresce, viu?',
      'Só {valor}? Tá, mas é assim que começa.',
    ],
    gasto_medio: [
      'Anotado: {valor} em {categoria}. Doeu? Devia.',
      '{valor} em {categoria}. Tô de olho, hein.',
    ],
    gasto_grande: [
      'PUTA QUE PARIU, {valor}?! Espero que tenha valido a pena.',
      '{valor} de uma vez? Caralho. Tomara que não seja besteira.',
    ],
    gasto_parcelado: [
      'Parcelou em {parcelas}x. O você do futuro mandou dizer que te odeia.',
      '{parcelas}x de {parcela}. Parcelinha é a forma mais educada de se fuder.',
    ],
    entrada: [
      'Caiu {valor}! Agora não vai torrar tudo igual um maluco.',
      '{valor} na conta! Respira antes de gastar.',
    ],
    guardou: [
      'Guardou {valor}. Olha só, virou gente grande.',
      '{valor} na caixinha. Orgulho do caralho.',
    ],
    resgatou: [
      'Tirou {valor} do cofrinho... espero que seja emergência de verdade, hein.',
      'Resgatou {valor}. Promete que vai devolver, né?',
    ],
    transferiu: ['Dinheiro mudou de bolso. Continua seu (por enquanto).'],
    excluiu: [
      'Apagado. Se fosse fácil assim apagar dívida...',
      'Sumiu. Igual seu dinheiro.',
    ],
    conta_paga: ['Conta paga! Menos um boleto te assombrando.', 'Pagou! Adulto responsável, quem diria.'],
    fatura_paga: ['Fatura paga. O banco agradece, seu bolso chora.'],
    voltou_pendente: ['Voltou pra pendente. Pagou ou não pagou, caralho?'],
    caixinha_criada: ['Caixinha criada. Agora enche ela, né, porra.'],
    instituicao_criada: ['{nome} cadastrado. Bem-vindo ao clube.'],
    salvo: ['Salvo. Não fez mais que a obrigação.', 'Pronto, anotado.'],
    backup_exportado: ['Backup salvo. Guarda isso direito, que se perder a culpa é sua.'],
    backup_importado: ['Dados de volta! Ressuscitou tudo.'],

    rotulo_alerta: ['Puta merda'],
    rotulo_atencao: ['Olha isso'],
    rotulo_dica: ['Dica de amigo'],
    dica_passou_planejado: ['Você já passou {valor} do planejado, contando os {meta} pra guardar. Para de gastar, porra!'],
    dica_categoria_estourou: ['{categoria} estourou o limite em {valor}. Parabéns, campeão do desperdício.'],
    dica_categoria_perto: ['{categoria} já comeu {percentual}% do limite{faltam}. Vai com calma aí.'],
    dica_ritmo: ['Nesse ritmo você vai gastar {projecao} no mês, {excesso} além do planejado. Freia essa porra.'],
    dica_conta_vence: ['{conta} vence {quando} ({valor}). Não vai esquecer e pagar juros feito otário.'],
    dica_fatura_alta: ['A fatura do {banco} tá em {percentual}% do que entrou. Cartão não é dinheiro extra, viu?'],
    dica_meta_guardar: ['Faltam {valor} pra meta de guardar do mês. Guarda assim que o salário cair, antes que você torre.'],
    dica_reserva: ['Sua reserva cobre {meses} meses de gastos. O ideal é de 3 a 6. Se perder o emprego amanhã, tá fudido.'],
    dica_sem_limites: ['Coloca limite nas categorias (Ajustes) que eu te dedo quando estiver exagerando.'],

    meta_atingida: ['Meta batida, caralho! Agora não vai torrar tudo de uma vez.'],
    meta_mensal: ['Guarde {valor} por mês até {prazo} ou esquece essa porra.'],
    meta_faltam: ['Faltam {valor}. Bora encher essa caixinha.'],
    aviso_metas_antigas: ['A aba Metas foi pro saco: agora a meta fica dentro da caixinha. Recria {nomes} lá (toca no banco → caixinha → Meta).'],

    vazio_lancamentos: ['Nada lançado. Ou você é muito econômico ou tá escondendo coisa. Toca no + aí.'],
    vazio_contas: ['Nenhuma conta fixa nem fatura neste mês. Milagre ou esquecimento?'],
  },

  normal: {
    saudacao_madrugada: ['Boa madrugada! Veja como está o seu mês.'],
    saudacao_manha: ['Bom dia! Veja como está o seu mês.'],
    saudacao_tarde: ['Boa tarde! Veja como está o seu mês.'],
    saudacao_noite: ['Boa noite! Veja como está o seu mês.'],

    situacao_sem_entradas: ['Cadastre seu salário em Ajustes → Contas fixas para calcular quanto pode gastar.'],
    situacao_passou: ['Você passou {valor} do planejado para este mês.'],
    situacao_apertado: ['Sobrou pouco para o resto do mês. Vale segurar os gastos.'],
    situacao_tranquilo: ['Seus gastos estão dentro do planejado.'],
    situacao_sobrando: ['Está sobrando dinheiro. Que tal guardar um pouco mais?'],

    gasto_pequeno: ['Gasto de {valor} em {categoria} salvo.'],
    gasto_medio: ['Gasto de {valor} em {categoria} salvo.'],
    gasto_grande: ['Gasto de {valor} salvo. É um valor alto para o seu mês.'],
    gasto_parcelado: ['Compra em {parcelas}x de {parcela} salva.'],
    entrada: ['Entrada de {valor} salva.'],
    guardou: ['{valor} guardado na caixinha.'],
    resgatou: ['{valor} resgatado da caixinha.'],
    transferiu: ['Transferência salva.'],
    excluiu: ['Excluído.'],
    conta_paga: ['Conta marcada como paga.'],
    fatura_paga: ['Fatura marcada como paga.'],
    voltou_pendente: ['Marcada como pendente.'],
    caixinha_criada: ['Caixinha criada.'],
    instituicao_criada: ['{nome} cadastrado.'],
    salvo: ['Salvo.'],
    backup_exportado: ['Backup salvo. Guarde o arquivo em um lugar seguro.'],
    backup_importado: ['Backup importado.'],

    rotulo_alerta: ['Alerta'],
    rotulo_atencao: ['Atenção'],
    rotulo_dica: ['Dica'],
    dica_passou_planejado: ['Os gastos do mês passaram {valor} do planejado, já contando os {meta} para guardar.'],
    dica_categoria_estourou: ['{categoria} passou {valor} do limite do mês.'],
    dica_categoria_perto: ['{categoria} já usou {percentual}% do limite{faltam}.'],
    dica_ritmo: ['No ritmo de hoje você gastaria {projecao} no mês, {excesso} além do planejado.'],
    dica_conta_vence: ['{conta} vence {quando} ({valor}).'],
    dica_fatura_alta: ['A fatura do {banco} deste mês é {percentual}% do que entrou. Acima de 30% costuma apertar o orçamento.'],
    dica_meta_guardar: ['Faltam {valor} para a meta de guardar deste mês. Guardar assim que o salário cai evita gastar antes.'],
    dica_reserva: ['Seu dinheiro guardado cobre {meses} meses dos seus gastos. O recomendado é ter de 3 a 6 meses de reserva.'],
    dica_sem_limites: ['Coloque limite nas categorias em que você mais gasta (Ajustes). O app avisa quando estiver chegando perto.'],

    meta_atingida: ['Meta atingida!'],
    meta_mensal: ['Guarde {valor} por mês até {prazo}.'],
    meta_faltam: ['Faltam {valor} para a meta.'],
    aviso_metas_antigas: ['A aba Metas saiu: agora a meta fica dentro da caixinha. Recrie {nomes} numa caixinha (toque no banco → caixinha → Meta).'],

    vazio_lancamentos: ['Nada lançado neste mês. Toque no + para começar.'],
    vazio_contas: ['Nenhuma conta fixa ou fatura de cartão neste mês.'],
  },
};

// sorteio: 'aleatorio' para reações (cada ação uma frase); um número fixo (ex.: o dia) para textos da tela,
// que assim não trocam a cada toque, só de um dia para o outro.
export function falar(tom, chave, valores = {}, sorteio = 'aleatorio') {
  const versoes = TEXTOS[tom][chave];
  const indice = sorteio === 'aleatorio' ? Math.floor(Math.random() * versoes.length) : sorteio % versoes.length;
  return versoes[indice].replace(/\{(\w+)\}/g, (_, nome) => valores[nome] ?? '');
}
