const fs = require('fs');
const Joi = require('joi');

const DIR = process.cwd();

const createValidation = (type) => (obj) => {
  const id = Joi.string();
  const idPedido = Joi.alternatives(Joi.number(), Joi.string().alphanum()).options({convert: true}); // TODO: ALPHANUM
  const numeroItem = Joi.number().integer().message('número_item deve ser um número inteiro')
    .positive().message('número_item deve ser um número positivo').required();
  const quantidadeProduto = Joi.number()
    .integer().message('quantidade_produto deve ser um número inteiro')
    .positive().message('quantidade_produto deve ser um número positivo').required();
  const codigoProduto = Joi.string().alphanum()
    .message('código_produto deve ser um valor alfanumérico),');
  const valorUnitarioProduto = Joi.number().precision(2)
    .message('valor_unitário_produto deve ter no maximo duas casas decimais')
    .positive().message('valor_unitário_produto deve ser um número positivo').options({ convert:  true });

  const pedidoSchema = Joi.object().keys({
    id,
    numero_item: numeroItem,
    quantidade_produto: quantidadeProduto,
    codigo_produto: codigoProduto,
    valor_unitario_produto: valorUnitarioProduto
  });

  const notaSchema = Joi.object().keys({
    id,
    id_pedido: idPedido,
    numero_item: numeroItem,
    quantidade_produto: quantidadeProduto
  });

  return type === 'pedido'
    ? pedidoSchema.validateAsync(obj, { convert:  false })
    : notaSchema.validateAsync(obj, { convert: false });
}

// Recebe os itens e o tipo (pedido ou nota) e valida através do Joi.
const validateParsedItens = (itens, type) => {
  itens.forEach((file) => file.forEach((item) => {
   
    if (item.valor_unitario_produto)
      item.valor_unitario_produto = Number(item.valor_unitario_produto.replace(",", "."))

    const validator = createValidation(type);
    validator(item);
  }));
}

/* Lê os itens do arquivo em forma de um Arrays de Arrays de strings JSON, e o diretorio desejado 
e retorna um novo array de arrays com mais inforamções e em javascript */
const parseItensToObj = (itens, directory) => {
  const itensMap = itens.map((file) => file.map(JSON.parse));
  const fileNames = fs.readdirSync(`${DIR}/${directory}`, 'utf-8').map((fileName) => fileName.replace('.txt', ''));
  const newItens = itensMap.map((file, index) => file.map(({ número_item, código_produto , valor_unitário_produto, ...item}) => ({
    ...item,
    id: `${fileNames[index]}`,
    ...(número_item && {numero_item: número_item}),
    ...(código_produto && {codigo_produto: código_produto}),
    ...(valor_unitário_produto && {valor_unitario_produto: valor_unitário_produto}),
  })));

  return newItens; 
}

/**
 * Lê o diretório passado e retorna um array de array com todos os itens.
 */
const readAllItemsFromFilesDirectory = (directory) => {
  const dir = `${DIR}/${directory}`;
 
  // Lê nome dos arquivos do diretório
  return fs.readdirSync(dir, 'utf-8')
    // Lê o conteúdo dos arquivos
    .map((fileNAme) => fs.readFileSync(`${dir}/${fileNAme}`, 'utf-8'))
    // Quebra arquivo em linhas e remove caracteres.
    .map((item) => item.split('\n').map((s) => s.replace("\r", "").trim()));
}

/* Recebe o item de cada pedido individualmente e a quantidade de items que estão nas notas e faz as comparações
coloca em um novo array todos os itens do pedido do qual não tem todos seus valores nas notas
lança uma exceção caso algum item do pedido tenha a sua quantidade ultrapassada nas notas
retorna um array com todos itens pendentes, com uma chave expecificando o item pendente, sua quantidade em notas
e quantidade que soma o saldo que falta */
const identifyPending = (pedidoItem, itemsQuantity) => {
  const peding = [];

  if (!itemsQuantity[`item${pedidoItem.numero_item}`]){
    pedidoItem[[`item${pedidoItem.numero_item}`]] = {
      qnt_produtos_nas_notas: 0,
      saldo_items_pendentes: (pedidoItem.quantidade_produto - 0) * pedidoItem.valor_unitario_produto
    }
    peding.push(pedidoItem);
  } else if (itemsQuantity[`item${pedidoItem.numero_item}`].quantidade_produto < pedidoItem.quantidade_produto) {
    pedidoItem[[`item${pedidoItem.numero_item}`]] = {
      qnt_produtos_nas_notas: itemsQuantity[`item${pedidoItem.numero_item}`].quantidade_produto,
      saldo_items_pendentes: (pedidoItem.quantidade_produto - itemsQuantity[`item${pedidoItem.numero_item}`].quantidade_produto) * pedidoItem.valor_unitario_produto
    }
    peding.push(pedidoItem);
  } else if (itemsQuantity[`item${pedidoItem.numero_item}`].quantidade_produto > pedidoItem.quantidade_produto) {
    throw new Error(`Ultrapassada a soma dos itens ${pedidoItem.id} - numero_item: ${pedidoItem.numero_item}`)
  }

  return peding;
}

/* Recebe um item de um pedido e o array de notas completo
Percorre por todas as notas e coloca dentro de um objeto, caso a nota seja do pedido passado
Cria um Objeto com a quantidades daquele item do pedido em notas
passa para uma outra função identificar os pedidos pendentes e retorna os pedidos pendentes */
const parsedItemsQuantityNotas = (pedidoItem, arrNotas) => {

  const itemsQuantityNotas = {};
  arrNotas.forEach((nota) => nota.forEach((item) => {
    if (item.id_pedido === Number(pedidoItem.id.replace('P', ''))) {
      if (itemsQuantityNotas[`item${item.numero_item}`]) {
        itemsQuantityNotas[`item${item.numero_item}`] = {
          quantidade_produto: item.quantidade_produto + itemsQuantityNotas[`item${item.numero_item}`].quantidade_produto
        }
      } else {
        itemsQuantityNotas[`item${item.numero_item}`] = { quantidade_produto: item.quantidade_produto }
      }
    }
  }))

  const pending = identifyPending(pedidoItem, itemsQuantityNotas)
  return pending;
}

const validateNumeroItemPedido = (parsedPedidos) => {
  const numerosItemsPedidos = parsedPedidos.map((pedido) => (
    pedido.map(pedidoItem => pedidoItem.numero_item)
  ));
  numerosItemsPedidos.forEach((array) => array.sort());

  numerosItemsPedidos.forEach((arrayNumerosItens) => {
    arrayNumerosItens.forEach((numeroItem, index) => {
      if (numeroItem !== index + 1) {
        throw new Error(`Há algum pedido com número item repetido ou não consecutivo de 1 ao maior número Item`)
      }
    })
  })
}

/* Percorre e analisa os números itens de notas lançando exceção caso algum valor
não corresponda ao tipo descrito ou caso seja informado algum par de id_pedido e número_item q não exista*/
const validateItems = (parsedNotas, parsedPedidos) => {
  parsedNotas.forEach(nota => nota.forEach(itemNota => {
    const pedido = parsedPedidos.find(pedido => pedido.find(itemPedido => itemPedido.id === `P${itemNota.id_pedido}`));

    if (!pedido)
      throw new Error(`Não foi encontrado o pedido P${itemNota.id_pedido}, referente a nota ${itemNota.id}`);

    const numeroItem = pedido.find(itemPedido => itemPedido.numero_item === itemNota.numero_item);

    if (!numeroItem)
      throw new Error(`Numero item não encontrado para a nota ${itemNota.id}`)
  }));
}
 
// Colocar o valor total do pedido em seus itens correspondentes
const insertTotal = (arrayPendingItems, objPeding) => {
  arrayPendingItems.forEach((pedidoItem) => {
    if (objPeding[`${pedidoItem.id}`]) {
      pedidoItem.valor_total_pedido = objPeding[`${pedidoItem.id}`].valor_total_pedido;
    }
  })
  return arrayPendingItems;
}

/* Recebe um array com os ids de todos pedidos pendentes, um array com os itens pendentes e todos pedidos para ser percorrido
Percorre o array de pedidos e confere quais sao pendentes, colocando no objeto os valores totais apenas dos pendentes
Chama uma função para inserir os valores totais dos pedidos */
const sumTotalPedidosPending = (pendingPedidoIdArrayFiltred, arrayPendingItems, parsedPedidos) => {
  const objPeding = {};

  let sum = 0;
  parsedPedidos.forEach(pArr => pArr.forEach((p, i) => {
    if (pendingPedidoIdArrayFiltred.includes(p.id)) {
      sum+= p.valor_unitario_produto * p.quantidade_produto;
      objPeding[`${p.id}`] = { valor_total_pedido: sum }
    }
    if (i === pArr.length - 1) {
      sum = 0;
    }
  }))

  const arrayItemsPedingWithTotal = insertTotal(arrayPendingItems, objPeding);
  return arrayItemsPedingWithTotal;
}

/* Recebe o array de pedidos pendentes e o array com os id dos itens pendentes
Coloca dentro de um objeto com as chaves referentes ao pedido e como valor um array com todos os items pendentes e todas informações necessárias
Retorna esse objeto com os pedidos e seus respectivos itens pendentes e inforamações. */
const pendingPedidosToObjItems = (arrPedidosPending, pendingPedidoIdArrayFiltred) => {
  const pendingPedidosObj = {};

  pendingPedidoIdArrayFiltred.forEach((idPedido) => {
    pendingPedidosObj[`${idPedido}`] = [];

    arrPedidosPending.forEach((pedidoItem) => {
      if (pedidoItem.id === idPedido) {
        const objPedido = {
          numero_item: pedidoItem.numero_item,
          quantidade_produtos_nos_pedidos: pedidoItem.quantidade_produto,
          valor_unitario_produto: pedidoItem.valor_unitario_produto,
          qnts_produtos_nas_notas: pedidoItem[`item${pedidoItem.numero_item}`].qnt_produtos_nas_notas,
          saldo_produtos_pendentes: pedidoItem[`item${pedidoItem.numero_item}`].saldo_items_pendentes,
          valor_total_pedido: pedidoItem.valor_total_pedido
        }
        pendingPedidosObj[`${idPedido}`].push(objPedido);
      }
    })
  })

  return pendingPedidosObj;
}

/* Recebe o objeto com os pedidos e seus respectivos itens pendentes
Faz a manipulação do obj juntando em um só pedido as informações necessárias, com uma chave contendo
todos os itens pendentes em uma lista */
const convertListPending = (objPedidosPending) => {
  const listPendingPedidos = [];

  Object.entries(objPedidosPending).forEach(([chave, valor]) => {
    const vItensPen = valor.map((v) => v.saldo_produtos_pendentes);
    const totalItemsPendentes = vItensPen.reduce((vItensPen, numero) => vItensPen + numero, 0);

    const data = {
      pedido: `${chave}`,
      valor_total_pedido: valor[0].valor_total_pedido,
      saldo_total_produtos_pendentes: totalItemsPendentes,
    };
    
    const list = [];

    valor.forEach((pedidoItem) => {
      const pedidoForList = {
        numero_item: pedidoItem.numero_item,
        quantidade_faltando_em_notas: pedidoItem.quantidade_produtos_nos_pedidos - pedidoItem.qnts_produtos_nas_notas
      };
      list.push(pedidoForList);
    })

    data.itens_pendentes = list;
    listPendingPedidos.push(data);
  })

  return listPendingPedidos;
}

// Recebe os pedidos e notas já validados, retornando um array com os pedidos pendentes e e suas informações
const parsedPendingPedidos = (parsedPedidos, parsedNotas) => {

  let arrayPendingItems = [];
  
  parsedPedidos.forEach((arrPedidos) => arrPedidos.forEach((pedidoItem) => {
    arrayPendingItems = [...arrayPendingItems, ...parsedItemsQuantityNotas(pedidoItem, parsedNotas)];
  }))

  const pendingPedidoIdArray = arrayPendingItems.map((p) => p.id);

  const pendingPedidoIdArrayFiltred = pendingPedidoIdArray.filter((p, i) => pendingPedidoIdArray.indexOf(p) === i);

  const arrPedidosPending = sumTotalPedidosPending(pendingPedidoIdArrayFiltred, arrayPendingItems, parsedPedidos);
  const objPedidosPending = pendingPedidosToObjItems(arrPedidosPending, pendingPedidoIdArrayFiltred);
  const listOfPending = convertListPending(objPedidosPending)

  return listOfPending
}

// Escreve um novo arquivo com os pedidos pendentes e seus respectivos itens, mostrando quanto faltou para o item não ser pendente
const writeNewFile = (listOfPending) => {
  fs.writeFile("Pendentes.txt", JSON.stringify(listOfPending, null, 2),
  {
    encoding: "utf8",
    flag: "w",
    mode: 0o666
  },
  (err) => {
    if (err)
      console.log(err);
    else {
      console.log("File written successfully\n");
    }
  });
}

try {
  const rawPedidoItems = readAllItemsFromFilesDirectory('Pedidos');
  const parsedPedidos = parseItensToObj(rawPedidoItems, 'Pedidos');

  validateParsedItens(parsedPedidos, 'pedido');
  
  const rawNotasItems = readAllItemsFromFilesDirectory('Notas');
  const parsedNotas = parseItensToObj(rawNotasItems, 'Notas');

  validateParsedItens(parsedNotas, 'nota');

  validateNumeroItemPedido(parsedPedidos);

  validateItems(parsedNotas, parsedPedidos);

  const listOfPending = parsedPendingPedidos(parsedPedidos, parsedNotas);

  writeNewFile(listOfPending);
} catch(err) {
  console.log(err.name === 'SyntaxError' ? 'JSON NÂO VÁLIDO': err.message)
} 


