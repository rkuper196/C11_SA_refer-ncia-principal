/*
p5.play
por Paolo Pedercini/molleindustria, 2015
http://molleindustria.org/
*/

(function(root, factory) {
if (typeof define === 'function' && define.amd)
define('p5.play', ['p5'], function(p5) { (factory(p5)); });
else if (typeof exports === 'object')
factory(require('../p5'));
else
factory(root.p5);
}(this, function(p5) {
/**
 * p5.play é uma biblioteca para p5.js para facilitar a criação de jogos e projetos
 * semelhantes.
 *
 * Ele fornece uma classe Sprite flexível para gerenciar objetos visuais em espaço 2D
 * e recursos como suporte de animação, detecção básica de colisão
 * e resolução, interações de mouse e teclado e uma câmera virtual.
 *
 * p5.play não é um mecanismo de física derivado de box2D, não usa eventos e é
 * programado para ser entendido e possivelmente modificado por programadores intermediários.
 *
 * Veja a pasta de exemplos para mais informações sobre como usar esta biblioteca.
 *
 * @module p5.play
 * @submodule p5.play
 * @for p5.play
 * @main
 */

// =============================================================================
//                         Inicialização
// =============================================================================

var DEFAULT_FRAME_RATE = 30;

// Esta é a nova maneira de inicializar propriedades p5 personalizadas para qualquer instância p5.
// O objetivo é migrar propriedades P5 preguiçosas para este método.
// @see https://github.com/molleindustria/p5.play/issues/46
p5.prototype.registerMethod('init', function p5PlayInit() {
  /**
   * A câmera de esboço é criada automaticamente no início de um esboço.
   * Uma câmera facilita a rolagem e o zoom para cenas que vão além
   * da tela. Uma câmera tem uma posição, um fator de zoom e as
   * coordenadas do mouse em relação à visualização.
   *
   * Em termos de p5.js, a câmera envolve todo o ciclo desenhado em uma
   * matriz de transformação, mas pode ser desativada a qualquer momento durante o ciclo de
   * desenho, por exemplo, para desenhar elementos de interface em uma posição absoluta.
   *
   * @property camera
   * @type {camera}
   */
  this.camera = new Camera(this, 0, 0, 1);
  this.camera.init = false;
});

// Isso fornece uma maneira de definirmos preguiçosamente propriedades que
// são globais para instâncias p5.
//
// Observe que isso não é apenas uma otimização: atualmente, o p5 não oferece
// nenhuma maneira de complementos serem notificados quando novas instâncias de p5 são criadas, então
// criar essas propriedades devagar é o * único * mecanismo disponível
// para nós. Para mais informação, ver:
//
// https://github.com/processing/p5.js/issues/1263
function defineLazyP5Property(name, getter) {
  Object.defineProperty(p5.prototype, name, {
    configurable: true,
    enumerable: true,
    get: function() {
      var context = (this instanceof p5 && !this._isGlobal) ? this : window;

      if (typeof(context._p5PlayProperties) === 'undefined') {
        context._p5PlayProperties = {};
      }
      if (!(name in context._p5PlayProperties)) {
        context._p5PlayProperties[name] = getter.call(context);
      }
      return context._p5PlayProperties[name];
    }
  });
}

// Isso retorna uma função de fábrica, adequada para passar para
// defineLazyP5Property, que retorna uma subclasse do dado
// construtor que está sempre ligado a uma instância p5 particular.
function boundConstructorFactory(constructor) {
  if (typeof(constructor) !== 'function')
    throw new Error('constructor must be a function');

  return function createBoundConstructor() {
    var pInst = this;

    function F() {
      var args = Array.prototype.slice.call(arguments);

      return constructor.apply(this, [pInst].concat(args));
    }
    F.prototype = constructor.prototype;

    return F;
  };
}

//  Este é um utilitário que torna fácil definir apelidos convenientes para
// métodos de instância p5 pré-ligados.
//
// Por exemplo:
//
//   var pInstBind = createPInstBinder(pInst);
//
//   var createVector = pInstBind('createVector');
//   var loadImage = pInstBind('loadImage');
//
// O acima irá criar funções createVector e loadImage, que podem ser
// usadas de forma semelhante ao modo global p5; no entanto, eles estão vinculados a instâncias p5
// específicas e, portanto, podem ser usadas fora do modo global.
function createPInstBinder(pInst) {
  return function pInstBind(methodName) {
    var method = pInst[methodName];

    if (typeof(method) !== 'function')
      throw new Error('"' + methodName + '" is not a p5 method');
    return method.bind(pInst);
  };
}

// Estas são funções utilitárias p5 que não dependem do estado da instância p5
// para funcionar corretamente, então vamos prosseguir e torná-los fáceis de
// acessar sem precisar vinculá-los a uma instância p5.
var abs = p5.prototype.abs;
var radians = p5.prototype.radians;
var dist = p5.prototype.dist;
var degrees = p5.prototype.degrees;
var pow = p5.prototype.pow;
var round = p5.prototype.round;


// =============================================================================
//                         substituições p5
// =============================================================================

/**
* Um grupo contendo todos os sprites no sketch.
*
* @property allSprites
* @type {Group}
*/

defineLazyP5Property('allSprites', function() {
  return new p5.prototype.Group();
});

p5.prototype.spriteUpdate = true;

/**
   * Um Sprite é o bloco de construção principal de p5.play:
   * um elemento capaz de armazenar imagens ou animações com um conjunto de
   * propriedades como posição e visibilidade.
   * Um Sprite pode ter um colisor que define a área ativa para detectar
   * colisões ou sobreposições com outros sprites e interações do mouse.
   *
   * Sprites criados usando createSprite (a forma preferida) são adicionados ao
   * grupo allSprites e dado um valor de profundidade que o coloca na frente de todos
   * outros sprites.
   *
   * @method createSprite
   * @param {Number} x Coordenada x inicial
   * @param {Number} y Coordenada y inicial
   * @param {Number} width Largura do retângulo marcador e do
   *                       colisor até que uma imagem ou novo colisor seja definido
   * @param {Number} height Altura do retângulo marcador e do
   *                       colisor até que uma imagem ou novo colisor seja definido
   * @return {Object} A nova instância de sprite
   */

p5.prototype.createSprite = function(x, y, width, height) {
  var s = new Sprite(this, x, y, width, height);
  s.depth = this.allSprites.maxDepth()+1;
  this.allSprites.add(s);
  return s;
};


/**
   * Remove um Sprite do sketch.
   * O Sprite removido não será mais desenhado ou atualizado.
   * Equivalente a Sprite.remove()
   *
   * @method removeSprite
   * @param {Object} sprite Sprite a ser removido
*/
p5.prototype.removeSprite = function(sprite) {
  sprite.remove();
};

/**
* Atualiza todos os sprites no sketch (posição, animação ...)
* é chamado automaticamente a cada draw().
* Pode ser pausado passando um parâmetro true ou false;
* Nota: não renderiza os sprites.
*
* @method updateSprites
* @param {Boolean} atualizando false para pausar a atualização, true para continuar
*/
p5.prototype.updateSprites = function(upd) {

  if(upd === false)
    this.spriteUpdate = false;
  if(upd === true)
    this.spriteUpdate = true;

  if(this.spriteUpdate)
  for(var i = 0; i<this.allSprites.size(); i++)
  {
    this.allSprites.get(i).update();
  }
};

/**
* Retorna todos os sprites no sketch como uma matriz
*
* @method getSprites
* @return {Array} Matriz de Sprites
*/
p5.prototype.getSprites = function() {

  //desenha tudo
  if(arguments.length===0)
  {
    return this.allSprites.toArray();
  }
  else
  {
    var arr = [];
    //para cada tag
    for(var j=0; j<arguments.length; j++)
    {
      for(var i = 0; i<this.allSprites.size(); i++)
      {
        if(this.allSprites.get(i).isTagged(arguments[j]))
          arr.push(this.allSprites.get(i));
      }
    }

    return arr;
  }

};

/**
* Exibe um grupo de sprites.
* Se nenhum parâmetro for especificado, desenha todos os sprites no
* sketch.
* A ordem do desenho é determinada pela propriedade Sprite "profundidade"
*
* @method drawSprites
* @param {Group} [group] Grupo de Sprites a serem exibidos
*/
p5.prototype.drawSprites = function(group) {
  // Se nenhum grupo for fornecido, desenhe o grupo allSprites.
  group = group || this.allSprites;

  if (typeof group.draw !== 'function')
  {
    throw('Error: with drawSprites you can only draw all sprites or a group');
  }

  group.draw();
};

/**
* Exibe um Sprite.
* Para ser usado normalmente na função draw principal.
*
* @method drawSprite
* @param {Sprite} sprite Sprite a ser exibido
*/
p5.prototype.drawSprite = function(sprite) {
  if(sprite)
  sprite.display();
};

/**
* Carrega uma animação.
* Para ser usado normalmente na função preload() do sketch.
*
* @method loadAnimation
* @param {Sprite} sprite Sprite a ser exibido
*/
p5.prototype.loadAnimation = function() {
  return construct(this.Animation, arguments);
};

/**
 *  Carrega uma planilha de Sprite.
 * Para ser usado normalmente na função preload() do sketch.
 *
 * @method loadSpriteSheet
 */
p5.prototype.loadSpriteSheet = function() {
  return construct(this.SpriteSheet, arguments);
};

/**
* Exibe uma animação.
*
* @method animation
* @param {Animation} anim Animação a ser exibida
* @param {Number} x X coordinate
* @param {Number} y Y coordinate
*
*/
p5.prototype.animation = function(anim, x, y) {
  anim.draw(x, y);
};

///variável para detectar pressões instantâneas
defineLazyP5Property('_p5play', function() {
  return {
    keyStates: {},
    mouseStates: {}
  };
});

var KEY_IS_UP = 0;
var KEY_WENT_DOWN = 1;
var KEY_IS_DOWN = 2;
var KEY_WENT_UP = 3;

/**
* Detecta se uma tecla foi pressionada durante o último ciclo.
* Pode ser usado para disparar eventos uma vez, quando uma tecla é pressionada ou liberada.
* Exemplo: Super Mario pulando.
*
* @method keyWentDown
* @param {Number|String} key Código-chave ou caractere
* @return {Boolean} True se a tecla foi pressionada
*/
p5.prototype.keyWentDown = function(key) {
  return this._isKeyInState(key, KEY_WENT_DOWN);
};


/**
* Detecta se uma tecla foi liberada durante o último ciclo.
* Pode ser usado para disparar eventos uma vez, quando uma tecla é pressionada ou liberada.
* Exemplo: disparos de nave espacial.
*
* @method keyWentUp
* @param {Number|String} key Código-chave ou caractere
* @return {Boolean} True se a tecla foi pressionada
*/
p5.prototype.keyWentUp = function(key) {
  return this._isKeyInState(key, KEY_WENT_UP);
};

/**
* Detecta se uma tecla está pressionada no momento
* Como p5 keyIsDown, mas aceita strings e códigos
*
* @method keyDown
* @param {Number|String} key Código-chave ou caractere
* @return {Boolean} True se a tecla estiver pressionada
*/
p5.prototype.keyDown = function(key) {
  return this._isKeyInState(key, KEY_IS_DOWN);
};

/**
 * Detecta se uma chave está no estado fornecido durante o último ciclo.
 * Método auxiliar que encapsula a lógica de estado de chave comum; pode ser preferível
 * chamar keyDown ou outros métodos diretamente.
 *
 * @private
 * @method _isKeyInState
 * @param {Number|String} key Código-chave ou caractere
 * @param {Number} state Estado-chave para verificar
 * @return {Boolean} True se a chave está no estado fornecido
 */
p5.prototype._isKeyInState = function(key, state) {
  var keyCode;
  var keyStates = this._p5play.keyStates;

  if(typeof key === 'string')
  {
    keyCode = this._keyCodeFromAlias(key);
  }
  else
  {
    keyCode = key;
  }

  //se indefinido, comece a verificar
  if(keyStates[keyCode]===undefined)
  {
    if(this.keyIsDown(keyCode))
      keyStates[keyCode] = KEY_IS_DOWN;
    else
      keyStates[keyCode] = KEY_IS_UP;
  }

  return (keyStates[keyCode] === state);
};

/**
* Detecta se um botão do mouse está pressionado
* Combina mouseIsPressed e mouseButton de p5
*
* @method mouseDown
* @param {Number} [buttonCode] Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL
* @return {Boolean} True se o botão estiver pressionado
*/
p5.prototype.mouseDown = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_IS_DOWN);
};

/**
* Detecta se um botão do mouse está pressionado
* Combina mouseIsPressed e mouseButton de p5
*
* @method mouseUp
* @param {Number} [buttonCode] Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL
* @return {Boolean} True se o botão estiver solto
*/
p5.prototype.mouseUp = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_IS_UP);
};

/**
 * Detecta se um botão do mouse foi liberado durante o último ciclo.
 * Pode ser usado para acionar eventos uma vez, para serem verificados no ciclo de desenho
 *
 * @method mouseWentUp
 * @param {Number} [buttonCode] Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL
 * @return {Boolean} True se o botão acabou de ser liberado
 */
p5.prototype.mouseWentUp = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_WENT_UP);
};


/**
 * Detecta se um botão do mouse foi pressionado durante o último ciclo.
 * Pode ser usado para acionar eventos uma vez, para serem verificados no ciclo de desenho
 *
 * @method mouseWentDown
 * @param {Number} [buttonCode] Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL
 * @return {Boolean} True se o botão foi apenas pressionado
 */
p5.prototype.mouseWentDown = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_WENT_DOWN);
};

/**
 * Detecta se um botão do mouse está no estado fornecido durante o último ciclo.
 * Método auxiliar que encapsula a lógica comum de estado do botão do mouse; pode ser
 * preferível chamar mouseWentUp, etc, diretamente.
 *
 * @private
 * @method _isMouseButtonInState
 * @param {Number} [buttonCode] Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL
 * @param {Number} state
 * @return {boolean} True se o botão estava no estado fornecido
 */
p5.prototype._isMouseButtonInState = function(buttonCode, state) {
  var mouseStates = this._p5play.mouseStates;

  if(buttonCode === undefined)
    buttonCode = this.LEFT;

  //indefinido = ainda não rastreado, comece a rastrear
  if(mouseStates[buttonCode]===undefined)
  {
  if(this.mouseIsPressed && this.mouseButton === buttonCode)
    mouseStates[buttonCode] = KEY_IS_DOWN;
  else
    mouseStates[buttonCode] = KEY_IS_UP;
  }

  return (mouseStates[buttonCode] === state);
};


/**
 * Um objeto que armazena todas as chaves úteis para fácil acesso
 * Key.tab = 9
 *
 * @private
 * @property KEY
 * @type {Object}
 */
p5.prototype.KEY = {
  'BACKSPACE': 8,
  'TAB': 9,
  'ENTER': 13,
  'SHIFT': 16,
  'CTRL': 17,
  'ALT': 18,
  'PAUSE': 19,
  'CAPS_LOCK': 20,
  'ESC': 27,
  'SPACE': 32,
  ' ': 32,
  'PAGE_UP': 33,
  'PAGE_DOWN': 34,
  'END': 35,
  'HOME': 36,
  'LEFT_ARROW': 37,
  'LEFT': 37,
  'UP_ARROW': 38,
  'UP': 38,
  'RIGHT_ARROW': 39,
  'RIGHT': 39,
  'DOWN_ARROW': 40,
  'DOWN': 40,
  'INSERT': 45,
  'DELETE': 46,
  '0': 48,
  '1': 49,
  '2': 50,
  '3': 51,
  '4': 52,
  '5': 53,
  '6': 54,
  '7': 55,
  '8': 56,
  '9': 57,
  'A': 65,
  'B': 66,
  'C': 67,
  'D': 68,
  'E': 69,
  'F': 70,
  'G': 71,
  'H': 72,
  'I': 73,
  'J': 74,
  'K': 75,
  'L': 76,
  'M': 77,
  'N': 78,
  'O': 79,
  'P': 80,
  'Q': 81,
  'R': 82,
  'S': 83,
  'T': 84,
  'U': 85,
  'V': 86,
  'W': 87,
  'X': 88,
  'Y': 89,
  'Z': 90,
  '0NUMPAD': 96,
  '1NUMPAD': 97,
  '2NUMPAD': 98,
  '3NUMPAD': 99,
  '4NUMPAD': 100,
  '5NUMPAD': 101,
  '6NUMPAD': 102,
  '7NUMPAD': 103,
  '8NUMPAD': 104,
  '9NUMPAD': 105,
  'MULTIPLY': 106,
  'PLUS': 107,
  'MINUS': 109,
  'DOT': 110,
  'SLASH1': 111,
  'F1': 112,
  'F2': 113,
  'F3': 114,
  'F4': 115,
  'F5': 116,
  'F6': 117,
  'F7': 118,
  'F8': 119,
  'F9': 120,
  'F10': 121,
  'F11': 122,
  'F12': 123,
  'EQUAL': 187,
  'COMMA': 188,
  'SLASH': 191,
  'BACKSLASH': 220
};

/**
*  Um objeto que armazena aliases de chave obsoletos, que ainda suportamos, mas
* deve ser mapeado para aliases válidos e gerar avisos.
*
* @private
* @property KEY_DEPRECATIONS
* @type {Object}
*/
p5.prototype.KEY_DEPRECATIONS = {
'MINUT': 'MINUS',
'COMA': 'COMMA'
};

/**
* Dado um alias de chave de string (conforme definido na propriedade KEY acima), procure
* e retorna o código-chave numérico JavaScript para essa chave. Se um
* alias for passado (conforme definido na propriedade KEY_DEPRECATIONS) será
* mapeado para um código de chave válido, mas também gerará um aviso sobre o uso
* do alias obsoleto.
*
* @private
* @method _keyCodeFromAlias
* @param {!string} alias - um alias de chave que não diferencia maiúsculas de minúsculas
* @return {number|undefined} um código-chave JavaScript numérico ou indefinido
*          se nenhum código de chave correspondente ao alias fornecido for encontrado.
*/
p5.prototype._keyCodeFromAlias = function(alias) {
alias = alias.toUpperCase();
if (this.KEY_DEPRECATIONS[alias]) {
  this._warn('Key literal "' + alias + '" is deprecated and may be removed ' +
    'in a future version of p5.play. ' +
    'Please use "' + this.KEY_DEPRECATIONS[alias] + '" instead.');
  alias = this.KEY_DEPRECATIONS[alias];
}
return this.KEY[alias];
};

//pre draw: detectar keyStates
p5.prototype.readPresses = function() {
var keyStates = this._p5play.keyStates;
var mouseStates = this._p5play.mouseStates;

for (var key in keyStates) {
  if(this.keyIsDown(key)) //se está inativo
  {
    if(keyStates[key] === KEY_IS_UP)//e estava ativo
      keyStates[key] = KEY_WENT_DOWN;
    else
      keyStates[key] = KEY_IS_DOWN; //agora está simplesmente inativo
  }
  else //se está inativo
  {
    if(keyStates[key] === KEY_IS_DOWN)//e estava ativo
      keyStates[key] = KEY_WENT_UP;
    else
      keyStates[key] = KEY_IS_UP; //agora está simplesmente inativo
  }
}

//mouse
for (var btn in mouseStates) {

  if(this._mouseButtonIsPressed(btn)) //se está inativo
  {
    if(mouseStates[btn] === KEY_IS_UP)//e estava ativo
      mouseStates[btn] = KEY_WENT_DOWN;
    else
      mouseStates[btn] = KEY_IS_DOWN; //agora está simplesmente inativo
  }
  else //se está inativo
  {
    if(mouseStates[btn] === KEY_IS_DOWN)//e estava ativo
      mouseStates[btn] = KEY_WENT_UP;
    else
      mouseStates[btn] = KEY_IS_UP; //agora está simplesmente inativo
  }
}

};

/**
* Liga ou desliga o quadTree.
* Um quadtree é uma estrutura de dados usada para otimizar a detecção de colisão.
* Pode melhorar o desempenho quando há um grande número de Sprites a serem
* verificados continuamente quanto a sobreposição.
*
* p5.play irá criar e atualizar um quadtree automaticamente.
*
* @method useQuadTree
* @param {Boolean} use Pass true para ativar, false para desativar
*/
p5.prototype.useQuadTree = function(use) {

  if(this.quadTree !== undefined)
  {
    if(use === undefined)
      return this.quadTree.active;
    else if(use)
      this.quadTree.active = true;
    else
      this.quadTree.active = false;
  }
  else
    return false;
};

//o quadTree verdadeiro
defineLazyP5Property('quadTree', function() {
  return new Quadtree({
    x: 0,
    y: 0,
    width: 0,
    height: 0
  }, 4);
});

/*
//delta independente da taxa de quadros, realmente não funciona
p5.prototype.deltaTime = 1;

var now = Date.now();
var then = Date.now();
var INTERVAL_60 = 0.0166666; //60 fps

function updateDelta() {
then = now;
now = Date.now();
deltaTime = ((now - then) / 1000)/INTERVAL_60; // segundos desde o último quadro
}
*/

/**
   * Um Sprite é o bloco de construção principal de p5.play:
   * um elemento capaz de armazenar imagens ou animações com um conjunto de
   * propriedades como posição e visibilidade.
   * Um Sprite pode ter um colisor que define a área ativa para detectar
   * colisões ou sobreposições com outros sprites e interações do mouse.
   *
   * Para criar um Sprite, use
   * {{#crossLink "p5.play/createSprite:method"}}{{/crossLink}}.
   *
   * @class Sprite
   */

// Para obter detalhes sobre por que esses documentos não estão em um bloco de comentários do YUIDoc, consulte:
//
// https://github.com/molleindustria/p5.play/pull/67
//
// @param {Number} x Coordenada x inicial
// @param {Number} y Coordenada y inicial
// @param {Number} width Largura do retângulo marcador e do
//                      colisor até que uma imagem ou novo colisor seja definido
// @param {Number} height Altura do retângulo marcador e do
//                      colisor até que uma imagem ou novo colisor seja definido
function Sprite(pInst, _x, _y, _w, _h) {
  var pInstBind = createPInstBinder(pInst);

  var createVector = pInstBind('createVector');
  var color = pInstBind('color');
  var random = pInstBind('random');
  var print = pInstBind('print');
  var push = pInstBind('push');
  var pop = pInstBind('pop');
  var colorMode = pInstBind('colorMode');
  var noStroke = pInstBind('noStroke');
  var rectMode = pInstBind('rectMode');
  var ellipseMode = pInstBind('ellipseMode');
  var imageMode = pInstBind('imageMode');
  var translate = pInstBind('translate');
  var scale = pInstBind('scale');
  var rotate = pInstBind('rotate');
  var stroke = pInstBind('stroke');
  var strokeWeight = pInstBind('strokeWeight');
  var line = pInstBind('line');
  var noFill = pInstBind('noFill');
  var fill = pInstBind('fill');
  var textAlign = pInstBind('textAlign');
  var textSize = pInstBind('textSize');
  var text = pInstBind('text');
  var rect = pInstBind('rect');
  var cos = pInstBind('cos');
  var sin = pInstBind('sin');
  var atan2 = pInstBind('atan2');

  var quadTree = pInst.quadTree;
  var camera = pInst.camera;


  // Essas são constantes p5 às quais gostaríamos de ter acesso fácil.
  var RGB = p5.prototype.RGB;
  var CENTER = p5.prototype.CENTER;
  var LEFT = p5.prototype.LEFT;
  var BOTTOM = p5.prototype.BOTTOM;

  /**
  * A posição do sprite, do sprite como um vetor (x, y).
  * @property position
  * @type {p5.Vector}
  */
  this.position = createVector(_x, _y);

  /**
  * A posição do sprite no início da última atualização como um vetor (x, y).
  * @property previousPosition
  * @type {p5.Vector}
  */
  this.previousPosition = createVector(_x, _y);

  /*
  A posição do sprite no final da última atualização como um vetor (x, y).
  Nota: isso será diferente da posição sempre que a posição for alterada
  diretamente por atribuição.
  */
  this.newPosition = createVector(_x, _y);

  //Deslocamento de posição na coordenada x desde a última atualização
  this.deltaX = 0;
  this.deltaY = 0;

  /**
  * A velocidade do sprite como um vetor (x, y)
  * Velocidade é a velocidade dividida em seus componentes verticais e horizontais.
  *
  * @property velocity
  * @type {p5.Vector}
  */
  this.velocity = createVector(0, 0);

  /**
  * Defina um limite para a velocidade escalar do sprite, independentemente da direção.
  * O valor só pode ser positivo. Se definido como -1, não há limite.
  *
  * @property maxSpeed
  * @type {Number}
  * @default -1
  */
  this.maxSpeed = -1;

  /**
  * Fator de atrito, reduz a velocidade do sprite.
  * O atrito deve ser próximo a 0 (por exemplo: 0,01)
  * 0: sem atrito
  * 1: atrito total
  *
  * @property friction
  * @type {Number}
  * @default 0
  */
  this.friction = 0;

  /**
  * O colisor atual do sprite.
  * Pode ser uma caixa delimitadora alinhada com o eixo (um retângulo não girado)
  * ou um colisor circular.
  * Se o sprite estiver marcado para eventos de colisão, salto, sobreposição ou mouse, o
  * colisor é criado automaticamente a partir da largura e altura
  * do sprite ou da dimensão da imagem no caso de sprites animados
  *
  * Você pode definir um colisor personalizado com Sprite.setCollider
  *
  * @property collider
  * @type {Object}
  */
  this.collider = undefined;

  //uso interno
  //"default" - nenhuma imagem ou colisor personalizado é especificado, use shape width / height
  //"custom" - especificado com setCollider
//"image" - nenhum colisor é definido com setCollider e uma imagem é acrescentada
  this.colliderType = 'none';

  /**
  * Objeto contendo informações sobre a colisão / sobreposição mais recente
  * Para ser usado normalmente em combinação com funções Sprite.overlap ou
  * Sprite.collide.
  * As propriedades são touching.left, touching.right, touching.top,
  * touch.bottom e são true ou false, dependendo do lado do
  * colisor.
  *
  * @property touching
  * @type {Object}
  */
  this.touching = {};
  this.touching.left = false;
  this.touching.right = false;
  this.touching.top = false;
  this.touching.bottom = false;

  /**
  * A massa determina a transferência de velocidade quando os sprites saltam
  * uns contra os outros. Veja Sprite.bounce
  * Quanto maior a massa, menos o sprite será afetado pelas colisões.
  *
  * @property mass
  * @type {Number}
  * @default 1
  */
  this.mass = 1;

  /**
  * Se definido como true, o sprite não irá saltar ou ser deslocado por colisões
  * Simula uma massa infinita ou um objeto ancorado.
  *
  * @property immovable
  * @type {Boolean}
  * @default false
  */
  this.immovable = false;

  //Coeficiente de restituição - velocidade perdida no salto
  //0 perfeitamente inelástico, 1 elástico,> 1 hiperelástico

  /**
  * Coeficiente de restituição. A velocidade perdida após o salto.
  * 1: perfeitamente elástico, nenhuma energia é perdida
  * 0: perfeitamente inelástico, sem salto
  * menor que 1: inelástico, este é o mais comum na natureza
  * maior que 1: hiperelástico, a energia é aumentada como em um pára-choque de pinball
  *
  * @property restitution
  * @type {Number}
  * @default 1
  */
  this.restitution = 1;

  /**
  * Rotação em graus do elemento visual (imagem ou animação)
  * Nota: esta não é a direção do movimento, consulte getDirection.
  *
  * @property rotation
  * @type {Number}
  * @default 0
  */
  Object.defineProperty(this, 'rotation', {
    enumerable: true,
    get: function() {
      return this._rotation;
    },
    set: function(value) {
      this._rotation = value;
      if (this.rotateToDirection) {
        this.setSpeed(this.getSpeed(), value);
      }
    }
  });

  /**
  * Variável de rotação interna (expressa em graus).
  * Nota: chamadores externos acessam isso por meio da propriedade de rotação acima.
  *
  * @private
  * @property _rotation
  * @type {Number}
  * @default 0
  */
  this._rotation = 0;

  /**
  * Mudança de rotação em graus por quadro do elemento visual (imagem ou animação)
  * Nota: esta não é a direção do movimento, consulte getDirection.
  *
  * @property rotationSpeed
  * @type {Number}
  * @default 0
  */
  this.rotationSpeed = 0;


  /**
  * Bloqueia automaticamente a propriedade de rotação do elemento visual
  * (imagem ou animação) para a direção do movimento do sprite e vice-versa.
  *
  * @property rotateToDirection
  * @type {Boolean}
  * @default false
  */
  this.rotateToDirection = false;


  /**
  * Determina a ordem de renderização dentro de um grupo: um sprite com menor
  * profundidade aparecerá abaixo daqueles com maior profundidade.
  *
  * Nota: desenhar um grupo antes de outro com drawSprites fará
  * com que seus membros apareçam abaixo do segundo, como no desenho de
  * tela p5 normal.
  *
  * @property depth
  * @type {Number}
  * @default One mais do que a maior profundidade de sprite existente, ao chamar
  *          createSprite(). Ao chamar um novo Sprite() diretamente, a profundidade irá
  *          inicializar em 0 (não recomendado).
  */
  this.depth = 0;

  /**
  * Determina a escala do sprite.
  * Exemplo: 2 terá o dobro do tamanho nativo dos visuais,
  * 0,5 será a metade. A ampliação pode tornar as imagens desfocadas.
  *
  * @property scale
  * @type {Number}
  * @default 1
  */
  this.scale = 1;

  var dirX = 1;
  var dirY = 1;

  /**
  * A visibilidade do sprite.
  *
  * @property visible
  * @type {Boolean}
  * @default true
  */
  this.visible = true;

  /**
  * Se definido como verdadeiro, o sprite rastreará o estado do mouse.
  * as propriedades mouseIsPressed e mouseIsOver serão atualizadas.
  * Nota: definido automaticamente como verdadeiro se as funções
  * onMouseReleased ou onMousePressed estão definidos.
  *
  * @property mouseActive
  * @type {Boolean}
  * @default false
  */
  this.mouseActive = false;

  /**
  * Verdadeiro se o mouse estiver no colisor do sprite.
  * Somente leitura.
  *
  * @property mouseIsOver
  * @type {Boolean}
  */
  this.mouseIsOver = false;

  /**
  * Verdadeiro se o mouse for pressionado no colisor do sprite.
  * Somente leitura.
  *
  * @property mouseIsPressed
  * @type {Boolean}
  */
  this.mouseIsPressed = false;

  /*
  * Largura da imagem atual do sprite.
  * Se nenhuma imagem ou animação forem definidas, é a largura do
  * retângulo marcador.
  * Usado internamente para fazer cálculos e desenhar o sprite.
  *
  * @private
  * @property _internalWidth
  * @type {Number}
  * @default 100
  */
  this._internalWidth = _w;

  /*
  * Altura da imagem atual do sprite.
  * Se nenhuma imagem ou animação forem definidas, é a altura do
  * retângulo marcador.
  * Usado internamente para fazer cálculos e desenhar o sprite.
  *
  * @private
  * @property _internalHeight
  * @type {Number}
  * @default 100
  */
  this._internalHeight = _h;

  /*
   * _internalWidth e _internalHeight são usados para todos os p5.play
   * cálculos, mas largura e altura podem ser estendidas. Por exemplo,
   * você pode querer que os usuários sempre obtenham e definam uma largura dimensionada:
      Object.defineProperty(this, 'width', {
        enumerable: true,
        configurable: true,
        get: function() {
          return this._internalWidth * this.scale;
        },
        set: function(value) {
          this._internalWidth = value / this.scale;
        }
      });
   */

  /**
  *  Largura da imagem atual do sprite.
  * Se nenhuma imagem ou animação forem definidas, é a largura do
  * retângulo marcador.
  *
  * @property width
  * @type {Number}
  * @default 100
  */
  Object.defineProperty(this, 'width', {
    enumerable: true,
    configurable: true,
    get: function() {
      return this._internalWidth;
    },
    set: function(value) {
      this._internalWidth = value;
    }
  });

  if(_w === undefined)
    this.width = 100;
  else
    this.width = _w;

  /**
  * Altura da imagem atual do sprite.
  * Se nenhuma imagem ou animação forem definidas, é a altura do
  * retângulo marcador.
  *
  * @property height
  * @type {Number}
  * @default 100
  */
  Object.defineProperty(this, 'height', {
    enumerable: true,
    configurable: true,
    get: function() {
      return this._internalHeight;
    },
    set: function(value) {
      this._internalHeight = value;
    }
  });

  if(_h === undefined)
    this.height = 100;
  else
    this.height = _h;

  /**
  * Largura sem escala do sprite
  * Se nenhuma imagem ou animação forem definidas, é a largura do
  * retângulo marcador.
  *
  * @property originalWidth
  * @type {Number}
  * @default 100
  */
  this.originalWidth = this._internalWidth;

  /**
  *  Altura sem escala do sprite
  * Se nenhuma imagem ou animação forem definidas, é a altura do
  * retângulo marcador.
  *
  * @property originalHeight
  * @type {Number}
  * @default 100
  */
  this.originalHeight = this._internalHeight;

  /**
  * Obtém a largura em escala do sprite.
  *
  * @property removed
  * @type {Boolean}
  */
  this.removed = false;

  /**
  * Ciclos antes da remoção automática.
  * Configure-o para iniciar uma contagem regressiva, a cada ciclo de desenho que a propriedade é
  * reduzida em 1 unidade. Em 0, ele chamará um sprite.remove()
  * Desativado se definido como -1.
  *
  * @property life
  * @type {Number}
  * @default -1
  */
  this.life = -1;

  /**
  * Se definido como true, desenha um contorno do colisor, a profundidade e o centro.
  *
  * @property debug
  * @type {Boolean}
  * @default false
  */
  this.debug = false;

  /**
  * Se nenhuma imagem ou animação for definida, esta é a cor do
  * retângulo marcador
  *
  * @property shapeColor
  * @type {color}
  */
  this.shapeColor = color(random(255), random(255), random(255));

  /**
  * Grupos aos quais o sprite pertence, incluindo allSprites
  *
  * @property groups
  * @type {Array}
  */
  this.groups = [];

  var animations = {};

  //O rótulo da animação atual.
  var currentAnimation = '';

  /**
  * Referência à animação atual.
  *
  * @property animation
  * @type {Animation}
  */
  this.animation = undefined;

  /*
   * @private
   * Manter propriedades de animação sincronizadas com as mudanças na animação.
   */
  this._syncAnimationSizes = function() {
    //tem uma animação, mas o colisor ainda é default
    //a animação não estava carregada. se a animação não é uma imagem 1x1
    //significa que terminou de carregar
    if(this.colliderType === 'default' &&
      animations[currentAnimation].getWidth() !== 1 && animations[currentAnimation].getHeight() !== 1)
    {
      this.collider = this.getBoundingBox();
      this.colliderType = 'image';
      this._internalWidth = animations[currentAnimation].getWidth()*abs(this._getScaleX());
      this._internalHeight = animations[currentAnimation].getHeight()*abs(this._getScaleY());
      //quadTree.insert(this);
    }

    //atualizar tamanho e colisor
    if(animations[currentAnimation].frameChanged || this.width === undefined || this.height === undefined)
    {
      //this.collider = this.getBoundingBox();
      this._internalWidth = animations[currentAnimation].getWidth()*abs(this._getScaleX());
      this._internalHeight = animations[currentAnimation].getHeight()*abs(this._getScaleY());
    }
  };

  /**
  * Atualiza o sprite.
  * Chamado automaticamente no início do ciclo draw.
  *
  * @method update
  */
  this.update = function() {

    if(!this.removed)
    {
      //se houver alguma alteração em algum lugar após a última atualização
      //a antiga posição é a última posição registrada nesta atualização
      if(this.newPosition !== this.position)
        this.previousPosition = createVector(this.newPosition.x, this.newPosition.y);
      else
        this.previousPosition = createVector(this.position.x, this.position.y);

      this.velocity.x *= 1 - this.friction;
      this.velocity.y *= 1 - this.friction;

      if(this.maxSpeed !== -1)
        this.limitSpeed(this.maxSpeed);

      if(this.rotateToDirection && this.velocity.mag() > 0)
        this._rotation = this.getDirection();

      this.rotation += this.rotationSpeed;

      this.position.x += this.velocity.x;
      this.position.y += this.velocity.y;

      this.newPosition = createVector(this.position.x, this.position.y);

      this.deltaX = this.position.x - this.previousPosition.x;
      this.deltaY = this.position.y - this.previousPosition.y;

      //if there is an animation
      if(animations[currentAnimation])
      {
        //update it
        animations[currentAnimation].update();

        this._syncAnimationSizes();
      }

      //um colisor é criado manualmente com setCollider ou
      // quando eu verifico este sprite para colisões ou sobreposições
      if(this.collider)
      {
        if(this.collider instanceof AABB)
        {
        //dimensionar / rotacionar colisor
        var t;
        if (pInst._angleMode === pInst.RADIANS) {
          t = radians(this.rotation);
        } else {
          t = this.rotation;
        }

        if(this.colliderType === 'custom')
          {
          this.collider.extents.x = this.collider.originalExtents.x * abs(this._getScaleX()) * abs(cos(t)) +
          this.collider.originalExtents.y * abs(this._getScaleY()) * abs(sin(t));

          this.collider.extents.y = this.collider.originalExtents.x * abs(this._getScaleX()) * abs(sin(t)) +
          this.collider.originalExtents.y * abs(this._getScaleY()) * abs(cos(t));
          }
        else if(this.colliderType === 'default')
          {
          this.collider.extents.x = this._internalWidth * abs(this._getScaleX()) * abs(cos(t)) +
          this._internalHeight * abs(this._getScaleY()) * abs(sin(t));
          this.collider.extents.y = this._internalWidth * abs(this._getScaleX()) * abs(sin(t)) +
          this._internalHeight * abs(this._getScaleY()) * abs(cos(t));
          }
        else if(this.colliderType === 'image')
          {
          this.collider.extents.x = this._internalWidth * abs(cos(t)) +
          this._internalHeight * abs(sin(t));

          this.collider.extents.y = this._internalWidth * abs(sin(t)) +
          this._internalHeight * abs(cos(t));
          }
        }

        if(this.collider instanceof CircleCollider)
        {
        //print(this.scale);
        this.collider.radius = this.collider.originalRadius * abs(this.scale);
        }

      }//end collider != null

      //ações do mouse
      if (this.mouseActive)
      {
        //se nenhum colisor defini-lo
          if(!this.collider)
            this.setDefaultCollider();

        this.mouseUpdate();
      }
      else
      {
        if (typeof(this.onMouseOver) === 'function' ||
            typeof(this.onMouseOut) === 'function' ||
            typeof(this.onMousePressed) === 'function' ||
            typeof(this.onMouseReleased) === 'function')
        {
          //se uma função do mouse for definida
          //está implícito que queremos ter o mouse ativo para
          //fazemos isso automaticamente
          this.mouseActive = true;

          //se nenhum colisor defini-lo
          if(!this.collider)
            this.setDefaultCollider();

          this.mouseUpdate();
        }
      }

      //contagem regressiva de autodestruição
      if (this.life>0)
        this.life--;
      if (this.life === 0)
        this.remove();
    }
  };//fim da atualização

  /**
   * Cria um colisor padrão correspondendo ao tamanho do
   * marcador retângulo ou a caixa delimitadora da imagem.
   *
   * @method setDefaultCollider
   */
  this.setDefaultCollider = function() {

    //se tem animação, faça a caixa delimitadora de animação
    //funcionar apenas para imagens pré-carregadas
    if(animations[currentAnimation] && (animations[currentAnimation].getWidth() !== 1 && animations[currentAnimation].getHeight() !== 1))
    {
      this.collider = this.getBoundingBox();
      this._internalWidth = animations[currentAnimation].getWidth()*abs(this._getScaleX());
      this._internalHeight = animations[currentAnimation].getHeight()*abs(this._getScaleY());
      //quadTree.insert(this);
      this.colliderType = 'image';
      //print("IMAGE COLLIDER ADDED");
    }
    else if(animations[currentAnimation] && animations[currentAnimation].getWidth() === 1 && animations[currentAnimation].getHeight() === 1)
    {
    //animação ainda está carregando
    //print("wait");
    }
    else //definir a largura e altura definidas na criação
    {
      this.collider = new AABB(pInst, this.position, createVector(this._internalWidth, this._internalHeight));
      //quadTree.insert(this);
      this.colliderType = 'default';
    }

    pInst.quadTree.insert(this);
  };

  /**
   * Atualiza os estados do sprite mouse e ativa os eventos do mouse:
   * onMouseOver, onMouseOut, onMousePressed, onMouseReleased
   *
   * @method mouseUpdate
   */
  this.mouseUpdate = function() {

    var mouseWasOver = this.mouseIsOver;
    var mouseWasPressed = this.mouseIsPressed;

    this.mouseIsOver = false;
    this.mouseIsPressed = false;

    var mousePosition;

    if(camera.active)
      mousePosition = createVector(camera.mouseX, camera.mouseY);
    else
      mousePosition = createVector(pInst.mouseX, pInst.mouseY);

      //rollover
      if(this.collider)
      {

        if (this.collider instanceof CircleCollider)
        {
          if (dist(mousePosition.x, mousePosition.y, this.collider.center.x, this.collider.center.y) < this.collider.radius)
            this.mouseIsOver = true;
        } else if (this.collider instanceof AABB)
        {
          if (mousePosition.x > this.collider.left() &&
              mousePosition.y > this.collider.top() &&
              mousePosition.x < this.collider.right() &&
              mousePosition.y < this.collider.bottom())
          {
            this.mouseIsOver = true;
          }
        }

        //var p5 global
        if(this.mouseIsOver && pInst.mouseIsPressed)
          this.mouseIsPressed = true;

        //mudança de evento - funções de chamada
        if(!mouseWasOver && this.mouseIsOver && this.onMouseOver !== undefined)
          if(typeof(this.onMouseOver) === 'function')
            this.onMouseOver.call(this, this);
          else
            print('Warning: onMouseOver should be a function');

        if(mouseWasOver && !this.mouseIsOver && this.onMouseOut !== undefined)
          if(typeof(this.onMouseOut) === 'function')
            this.onMouseOut.call(this, this);
          else
            print('Warning: onMouseOut should be a function');

        if(!mouseWasPressed && this.mouseIsPressed && this.onMousePressed !== undefined)
          if(typeof(this.onMousePressed) === 'function')
            this.onMousePressed.call(this, this);
          else
            print('Warning: onMousePressed should be a function');

        if(mouseWasPressed && !pInst.mouseIsPressed && !this.mouseIsPressed && this.onMouseReleased !== undefined)
          if(typeof(this.onMouseReleased) === 'function')
            this.onMouseReleased.call(this, this);
          else
            print('Warning: onMouseReleased should be a function');

      }

  };

  /**
  * Define um colisor para o sprite.
  *
  * Em p5.play, um colisor é um círculo ou retângulo invisível
  * que pode ter qualquer tamanho ou posição em relação ao sprite e qual
  * será usado para detectar colisões e sobreposição com outros sprites,
  * ou o cursor do mouse.
  *
  * Se o sprite estiver marcado para eventos de colisão, salto, sobreposição ou mouse
  * um colisor retangular é criado automaticamente a partir do parâmetro de largura e altura
  * passado na criação do sprite ou da dimensão
  * da imagem no caso de sprites animados.
  *
  * Freqüentemente, a caixa delimitadora da imagem não é apropriada como área ativa para
  * detecção de colisão para que você possa definir um sprite circular ou retangular com
  * dimensões diferentes e deslocamento do centro do sprite.
  *
  * Há quatro maneiras de chamar esse método:
  *
  * 1. setCollider("rectangle")
  * 2. setCollider("rectangle", offsetX, offsetY, width, height)
  * 3. setCollider("circle")
  * 4. setCollider("circle", offsetX, offsetY, radius)
  *
  * @method setCollider
  * @param {String} type Ou "rectangle", ou "circle"
  * @param {Number} offsetX Posição x do colisor a partir do centro do sprite
  * @param {Number} offsetY Posição y do colisor a partir do centro do sprite
  * @param {Number} width Largura ou raio do colisor
  * @param {Number} height Altura do colisor
  * @throws {TypeError} se parâmetros inválidos forem dados.
  */
  this.setCollider = function(type, offsetX, offsetY, width, height) {
    if (!(type === 'rectangle' || type === 'circle')) {
      throw new TypeError('setCollider expects the first argument to be either "circle" or "rectangle"');
    } else if (type === 'circle' && arguments.length > 1 && arguments.length < 4) {
      throw new TypeError('Usage: setCollider("circle") or setCollider("circle", offsetX, offsetY, radius)');
    } else if (type === 'circle' && arguments.length > 4) {
      pInst._warn('Extra parameters to setCollider were ignored. Usage: setCollider("circle") or setCollider("circle", offsetX, offsetY, radius)');
    } else if (type === 'rectangle' && arguments.length > 1 && arguments.length < 5) {
      throw new TypeError('Usage: setCollider("rectangle") or setCollider("rectangle", offsetX, offsetY, width, height)');
    } else if (type === 'rectangle' && arguments.length > 5) {
      pInst._warn('Extra parameters to setCollider were ignored. Usage: setCollider("rectangle") or setCollider("rectangle", offsetX, offsetY, width, height)');
    }

    this.colliderType = 'custom';

    var v = createVector(offsetX, offsetY);
    if (type === 'rectangle' && arguments.length === 1) {
      this.collider = new AABB(pInst, this.position, createVector(this.width, this.height));
    } else if (type === 'rectangle' && arguments.length >= 5) {
      this.collider = new AABB(pInst, this.position, createVector(width, height), v);
    } else if (type === 'circle' && arguments.length === 1) {
      this.collider = new CircleCollider(pInst, this.position, Math.floor(Math.max(this.width, this.height) / 2));
    } else if (type === 'circle' && arguments.length >= 4) {
      this.collider = new CircleCollider(pInst, this.position, width, v);
    }

    quadTree.insert(this);
  };

  /**
   * Devolve a caixa de delimitação para a imagem atual
   * @method getBoundingBox
   */
  this.getBoundingBox = function() {

    var w = animations[currentAnimation].getWidth()*abs(this._getScaleX());
    var h = animations[currentAnimation].getHeight()*abs(this._getScaleY());

    //se a caixa de delimitação for 1x1 a imagem não será carregada
    //problema potencial com imagens 1x1 verdadeiras
    if(w === 1 && h === 1) {
      //não está carregado ainda
      return new AABB(pInst, this.position, createVector(w, h));
    }
    else {
      return new AABB(pInst, this.position, createVector(w, h));
    }
  };

  /**
  * Define o espelhamento horizontal do sprite.
  * Se 1 as imagens são exibidas normalmente
  * Se -1 as imagens são invertidas horizontalmente
  * Se nenhum argumento retorna o espelhamento x atual
  *
  * @method mirrorX
  * @param {Number} dir Ou 1 ou -1
  * @return {Number} Espelhamento atual se nenhum parâmetro for especificado
  */
  this.mirrorX = function(dir) {
    if(dir === 1 || dir === -1)
      dirX = dir;
    else
      return dirX;
  };

  /**
  * Define o espelhamento vertical do sprite.
  * Se 1 as imagens são exibidas normalmente
  * Se -1 as imagens são invertidas verticalmente
  * Se nenhum argumento retorna o espelhamento y atual
  *
  * @method mirrorY
  * @param {Number} dir Ou 1 ou -1
  * @return {Number} Espelhamento atual se nenhum parâmetro for especificado
  */
  this.mirrorY = function(dir) {
    if(dir === 1 || dir === -1)
      dirY = dir;
    else
      return dirY;
  };

  /*
   * etorna o valor que o sprite deve ser escalado na direção X.
   * Usado para calcular renderização e colisões.
   * @private
   */
  this._getScaleX = function()
  {
    return this.scale;
  };

  /*
   * etorna o valor que o sprite deve ser escalado na direção Y.
   * Usado para calcular renderização e colisões.
   * @private
   */
  this._getScaleY = function()
  {
    return this.scale;
  };

  /**
   * Gerencia o posicionamento, escala e rotação do sprite
   * Chamado automaticamente, não deve ser substituído
   * @private
   * @final
   * @method display
   */
  this.display = function()
  {
    if (this.visible && !this.removed)
    {
      push();
      colorMode(RGB);

      noStroke();
      rectMode(CENTER);
      ellipseMode(CENTER);
      imageMode(CENTER);

      translate(this.position.x, this.position.y);
      scale(this._getScaleX()*dirX, this._getScaleY()*dirY);
      if (pInst._angleMode === pInst.RADIANS) {
        rotate(radians(this.rotation));
      } else {
        rotate(this.rotation);
      }
      this.draw();
      //desenhar informações de depuração
      pop();


      if(this.debug)
      {
        push();
        //desenhar o ponto âncora
        stroke(0, 255, 0);
        strokeWeight(1);
        line(this.position.x-10, this.position.y, this.position.x+10, this.position.y);
        line(this.position.x, this.position.y-10, this.position.x, this.position.y+10);
        noFill();

        //número de profundidade
        noStroke();
        fill(0, 255, 0);
        textAlign(LEFT, BOTTOM);
        textSize(16);
        text(this.depth+'', this.position.x+4, this.position.y-2);

        noFill();
        stroke(0, 255, 0);

        //caixa de delimitação
        if(this.collider !== undefined)
        {
          this.collider.draw();
        }
        pop();
      }

    }
  };


  /**
  * Gerencia o visual do sprite.
  * Ele pode ser substituído por uma função de desenho personalizada.
  * O ponto 0,0 será o centro do sprite.
  * Exemplo:
  * sprite.draw = function() { ellipse(0,0,10,10) }
  * Irá exibir o sprite como um círculo.
  *
  * @method draw
  */
  this.draw = function()
  {
    if(currentAnimation !== '' && animations)
    {
      if(animations[currentAnimation])
        animations[currentAnimation].draw(0, 0, 0);
    }
    else
    {
      noStroke();
      fill(this.shapeColor);
      rect(0, 0, this._internalWidth, this._internalHeight);
    }
  };

  /**
   * Remove o Sprite do sketch.
   * O Sprite removido não será mais desenhado ou atualizado.
   *
   * @method remove
   */
  this.remove = function() {
    this.removed = true;

    quadTree.removeObject(this);

    //quando removido da "cena" também remove todas as referências em todos os grupos
    while (this.groups.length > 0) {
      this.groups[0].remove(this);
    }
  };

  /**
  * Define o vetor de velocidade.
  *
  * @method setVelocity
  * @param {Number} x X component
  * @param {Number} y Y component
  */
  this.setVelocity = function(x, y) {
    this.velocity.x = x;
    this.velocity.y = y;
  };

  /**
  * Calcula a velocidade escalar.
  *
  * @method getSpeed
  * @return {Number} Velocidade escalar
  */
  this.getSpeed = function() {
    return this.velocity.mag();
  };

  /**
  * Calcula a direção do movimento em graus.
  *
  * @method getDirection
  * @return {Number} Ângulo em graus
  */
  this.getDirection = function() {

    var direction = atan2(this.velocity.y, this.velocity.x);

    if(isNaN(direction))
      direction = 0;

    // Ao contrário de Math.atan2, o método atan2 acima retornará para graus se
    // o anguloMode p5 atual for ÂNGULOS, e radianos se o anguloMode p5 for
    // RADIANOS.  Este método sempre deve retornar graus (por enquanto).
    // Veja https://github.com/molleindustria/p5.play/issues/94
    if (pInst._angleMode === pInst.RADIANS) {
      direction = degrees(direction);
    }

    return direction;
  };

  /**
  * Adiciona o sprite a um grupo existente
  *
  * @method addToGroup
  * @param {Object} group
  */
  this.addToGroup = function(group) {
    if(group instanceof Array)
      group.add(this);
    else
      print('addToGroup error: '+group+' is not a group');
  };

  /**
  * Limita a velocidade escalar.
  *
  * @method limitSpeed
  * @param {Number} max Velocidade máxima: número positivo
  */
  this.limitSpeed = function(max) {

    //atualizar velocidade linear
    var speed = this.getSpeed();

    if(abs(speed)>max)
    {
      //encontrar fator de redução
      var k = max/abs(speed);
      this.velocity.x *= k;
      this.velocity.y *= k;
    }
  };

  /**
  * Defina a velocidade e direção do sprite.
  * A ação substitui a velocidade atual.
  * Se a direção não for fornecida, a direção atual será mantida.
  * Se a direção não for fornecida e não houver velocidade atual, a rotação
  * angular atual é usado para a direção.
  *
  * @method setSpeed
  * @param {Number}  speed Velocidade escalar
  * @param {Number}  [angle] Direção em graus
  */
  this.setSpeed = function(speed, angle) {
    var a;
    if (typeof angle === 'undefined') {
      if (this.velocity.x !== 0 || this.velocity.y !== 0) {
        a = pInst.atan2(this.velocity.y, this.velocity.x);
      } else {
        if (pInst._angleMode === pInst.RADIANS) {
          a = radians(this._rotation);
        } else {
          a = this._rotation;
        }
      }
    } else {
      if (pInst._angleMode === pInst.RADIANS) {
        a = radians(angle);
      } else {
        a = angle;
      }
    }
    this.velocity.x = cos(a)*speed;
    this.velocity.y = sin(a)*speed;
  };

  /**
  * Empurra o sprite em uma direção definida por um ângulo.
  * A força é adicionada à velocidade atual.
  *
  * @method addSpeed
  * @param {Number}  speed Velocidade escalar para adicionar
  * @param {Number}  angle Direção em graus
  */
  this.addSpeed = function(speed, angle) {
    var a;
    if (pInst._angleMode === pInst.RADIANS) {
      a = radians(angle);
    } else {
      a = angle;
    }
    this.velocity.x += cos(a) * speed;
    this.velocity.y += sin(a) * speed;
  };

  /**
  * Empurra o sprite em direção a um ponto.
  * A força é adicionada à velocidade atual.
  *
  * @method attractionPoint
  * @param {Number}  magnitude Velocidade escalar para adicionar
  * @param {Number}  pointX Coordenada de direção x
  * @param {Number}  pointY Coordenada de direção y
  */
  this.attractionPoint = function(magnitude, pointX, pointY) {
    var angle = atan2(pointY-this.position.y, pointX-this.position.x);
    this.velocity.x += cos(angle) * magnitude;
    this.velocity.y += sin(angle) * magnitude;
  };


  /**
  * Adiciona uma imagem ao sprite.
  * Uma imagem será considerada uma animação de um quadro.
  * A imagem deve ser pré-carregada na função preload() usando p5 loadImage.
  * As animações requerem um rótulo de identificação (string) para alterá-las.
  * A imagem é armazenada no sprite, mas não necessariamente exibida
  * até que Sprite.changeAnimation(label) seja chamado
  *
  * Usos:
  * - sprite.addImage(label, image);
  * - sprite.addImage(image);
  *
  * Se apenas uma imagem for passada, nenhum rótulo é especificado
  *
  * @method addImage
  * @param {String|p5.Image} label Rótulo ou imagem
  * @param {p5.Image} [img] Imagem
  */
  this.addImage = function()
  {
    if(typeof arguments[0] === 'string' && arguments[1] instanceof p5.Image)
      this.addAnimation(arguments[0], arguments[1]);
    else if(arguments[0] instanceof p5.Image)
      this.addAnimation('normal', arguments[0]);
    else
      throw('addImage error: allowed usages are <image> or <label>, <image>');
  };

  /**
  * Adiciona uma animação ao sprite.
  * A animação deve ser pré-carregada na função preload()
  * usando loadAnimation.
  * Animações requerem uma etiqueta de identificação (string) para alterá-las.
  * Animações são armazenadas no sprite, mas não necessariamente exibidas
  * até Sprite.changeAnimation(label) ser chamada.
  *
  * Usos:
  * - sprite.addAnimation(label, animation);
  *
  * Usos alternativos. Veja Animação para mais informações sobre sequências de arquivos:
  * - sprite.addAnimation(label, firstFrame, lastFrame);
  * - sprite.addAnimation(label, frame1, frame2, frame3...);
  *
  * @method addAnimation
  * @param {String} label Identificador de animação
  * @param {Animation} animation A animação pré-carregada
  */
  this.addAnimation = function(label)
  {
    var anim;

    if(typeof label !== 'string')
    {
      print('Sprite.addAnimation error: the first argument must be a label (String)');
      return -1;
    }
    else if(arguments.length < 2)
    {
      print('addAnimation error: you must specify a label and n frame images');
      return -1;
    }
    else if(arguments[1] instanceof Animation)
    {

      var sourceAnimation = arguments[1];

      var newAnimation = sourceAnimation.clone();

      animations[label] = newAnimation;

      if(currentAnimation === '')
      {
        currentAnimation = label;
        this.animation = newAnimation;
      }

      newAnimation.isSpriteAnimation = true;

      this._internalWidth = newAnimation.getWidth()*abs(this._getScaleX());
      this._internalHeight = newAnimation.getHeight()*abs(this._getScaleY());

      return newAnimation;
    }
    else
    {
      var animFrames = [];
      for(var i=1; i<arguments.length; i++)
        animFrames.push(arguments[i]);

      anim = construct(pInst.Animation, animFrames);
      animations[label] = anim;

      if(currentAnimation === '')
      {
        currentAnimation = label;
        this.animation = anim;
      }
      anim.isSpriteAnimation = true;

      this._internalWidth = anim.getWidth()*abs(this._getScaleX());
      this._internalHeight = anim.getHeight()*abs(this._getScaleY());

      return anim;
    }

  };

  /**
  * Altera a imagem/animação exibida.
  * Equivalente a changeAnimation
  *
  * @method changeImage
  * @param {String} label Identificador de imagem/animação
  */
  this.changeImage = function(label) {
    this.changeAnimation(label);
  };

   /**
  * Retorna o rótulo da animação atual
  *
  * @method getAnimationLabel
  * @return {String} label Identificador de imagem/animação
  */
  this.getAnimationLabel = function() {
    return currentAnimation;
  };

  /**
  * Altera a animação exibida.
  * Veja Animação para mais controle sobre a sequência.
  *
  * @method changeAnimation
  * @param {String} label Identificador de animação
  */
  this.changeAnimation = function(label) {
    if(!animations[label])
      print('changeAnimation error: no animation labeled '+label);
    else
    {
      currentAnimation = label;
      this.animation = animations[label];
    }
  };

  /**
  * Verifica se o ponto dado corresponde a um pixel transparente
  * na imagem atual do sprite. Pode ser usado para verificar um ponto de colisão
  * contra apenas a parte visível do sprite.
  *
  * @method overlapPixel
  * @param {Number} pointX coordenada x do ponto a verificar
  * @param {Number} pointY coordenada y do ponto a verificar
  * @return {Boolean} result Verdadeiro se não transparente
  */
  this.overlapPixel = function(pointX, pointY) {
    var point = createVector(pointX, pointY);

    var img = this.animation.getFrameImage();

    //converter ponto para posição relativa da imagem
    point.x -= this.position.x-img.width/2;
    point.y -= this.position.y-img.height/2;

    //totalmente fora da imagem
    if(point.x<0 || point.x>img.width || point.y<0 || point.y>img.height)
      return false;
    else if(this.rotation === 0 && this.scale === 1)
    {
      //verdadeiro se opacidade total
      var values = img.get(point.x, point.y);
      return values[3] === 255;
    }
    else
    {
      print('Error: overlapPixel doesn\'t work with scaled or rotated sprites yet');
      //impressão fora da tela a ser implementada bleurch
      return false;
    }
  };

  /**
  *  Verifica se o ponto dado está dentro do colisor do sprite.
  *
  * @method overlapPoint
  * @param {Number} pointX coordenada x do ponto a verificar
  * @param {Number} pointY coordenada y do ponto a verificar
  * @return {Boolean} result Verdadeiro se dentro
  */
  this.overlapPoint = function(pointX, pointY) {
    var point = createVector(pointX, pointY);

    if(!this.collider)
      this.setDefaultCollider();

    if(this.collider !== undefined)
    {
      if(this.collider instanceof AABB)
        return (point.x > this.collider.left() && point.x < this.collider.right() && point.y > this.collider.top() && point.y < this.collider.bottom());
      if(this.collider instanceof CircleCollider)
      {
        var sqRadius = this.collider.radius * this.collider.radius;
        var sqDist = pow(this.collider.center.x - point.x, 2) + pow(this.collider.center.y - point.y, 2);
        return sqDist<sqRadius;
      }
      else
        return false;
    }
    else
      return false;

  };


  /**
  *  Verifica se o sprite está se sobrepondo a outro sprite ou grupo.
  * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos,
  * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
  *
  * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
  * quando ocorre a sobreposição.
  * Se o alvo for um grupo, a função será chamada para cada um
  * sobreposição de sprites. O parâmetro da função são respectivamente os
  * sprite atual e o sprite em colisão.
  *
  * @example
  *     sprite.overlap(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method overlap
  * @param {Object} target Sprite ou grupo para comparar com o atual
  * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
  * @return {Boolean} True se sobreposto
  */
  this.overlap = function(target, callback) {
    return this._collideWith('overlap', target, callback);

  };

  /**
  * Verifica se o sprite está se sobrepondo a outro sprite ou a um grupo.
  * Se a sobreposição for positiva o sprite atual será substituído pelo
  * sprite colisor na posição não-sobreposta mais próxima.
  *
  * A verificação é feita usando os colisores. Se os colisores não foram definidos
  * eles serão criados automaticamente pela imagem/animação da caixa delimitadora.
  *
  * Uma função de retorno pode ser especificada para desempenhar operações adicionais
  * quando a colisão ocorre.
  * Se o alvo é um grupo, a função será chamada para cada
  * sprite colidindo. Os parâmetros da função são, respectivamente, o
  * sprite atual e o sprite em colisão.
  *
  * @example
  *     sprite.collide(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method collide
  * @param {Object} target Sprite ou grupo para comparar com o atual
  * @param {Function} [callback] A função a ser chamada se sobreposição for positiva
  * @return {Boolean} True se sobrepondo
  */
  this.collide = function(target, callback) {
    //if(this.collider instanceof AABB && target.collider instanceof AABB)
    return this.AABBops('collide', target, callback);
  };

  /**
  * Verifica se o sprite está se sobrepondo a outro sprite ou a um grupo.
  * Se a sobreposição for positiva o sprite atual será substituído pelo
  * sprite colisor na posição não-sobreposta mais próxima.
  *
  * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
  * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
  *
  * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
  * quando ocorre a colisão.
  * Se o alvo for um grupo, a função será chamada para cada
  * Sprite colidindo. Os parâmetros da função são, respectivamente, o
  * sprite atual e o sprite em colisão.
  *
  * @example
  *     sprite.displace(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method displace
  * @param {Object} target Sprite ou grupo para comparar com o atual
  * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
  * @return {Boolean} True se sobreposto
  */
  this.displace = function(target, callback) {
    return this.AABBops('displace', target, callback);
  };

  /**
  * Verifica se o sprite está se sobrepondo a outro sprite ou grupo.
  * Se a sobreposição for positiva, os sprites irão pular afetando todas as
  * outras trajetórias, dependendo de sua .velocity .mass e .restitution
  *
  * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
  * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
  *
  * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
  * quando ocorre a colisão.
  * Se o alvo for um grupo, a função será chamada para cada
  * Sprite colidindo. O parâmetro da função são respectivamente os
  * sprite atual e o sprite em colisão.
  *
  * @example
  *     sprite.bounce(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method bounce
  * @param {Object} target Sprite ou grupo para comparar com o atual
  * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
  * @return {Boolean} True se sobreposto
  */
  this.bounce = function(target, callback) {
    return this.AABBops('bounce', target, callback);
  };

  // Função de detecção de colisão interna. Não use diretamente.
  this.AABBops = function(type, target, callback) {

    this.touching.left = false;
    this.touching.right = false;
    this.touching.top = false;
    this.touching.bottom = false;

    var result = false;

    //se sprite único se tornar matriz de qualquer maneira
    var others = [];

    if(target instanceof Sprite)
      others.push(target);
    else if(target instanceof Array)
    {
      if(quadTree !== undefined && quadTree.active)
        others = quadTree.retrieveFromGroup( this, target);

      if(others.length === 0)
        others = target;

    }
    else
      throw('Error: overlap can only be checked between sprites or groups');

    for(var i=0; i<others.length; i++)
      if(this !== others[i] && !this.removed) //você pode verificar as colisões dentro do mesmo grupo mas não o próprio
      {
        var displacement;
        var other = others[i];

        if(this.collider === undefined)
          this.setDefaultCollider();

        if(other.collider === undefined)
          other.setDefaultCollider();

        /*
        if(this.colliderType=="default" && animations[currentAnimation]!=null)
        {
          print("busted");
          return false;
        }*/
        if(this.collider !== undefined && other.collider !== undefined)
        {
        if(type === 'overlap') {
            var over;

            //se o outro for um círculo, eu calculo a sobreposição a partir daqui
            if(this.collider instanceof CircleCollider)
                over = other.collider.overlap(this.collider);
            else
                over = this.collider.overlap(other.collider);

            if(over)
            {

              result = true;

              if(callback !== undefined && typeof callback === 'function')
                callback.call(this, this, other);
            }
          }
        else if(type === 'collide' || type === 'displace' || type === 'bounce')
          {
            displacement = createVector(0, 0);

            //se a soma da velocidade for maior que o colisor eu posso
            //um problema nos túneis
            var tunnelX = abs(this.velocity.x-other.velocity.x) >= other.collider.extents.x/2 && round(this.deltaX - this.velocity.x) === 0;

            var tunnelY = abs(this.velocity.y-other.velocity.y) >= other.collider.size().y/2 && round(this.deltaY - this.velocity.y) === 0;


            if(tunnelX || tunnelY)
            {
              //ao invés de usar os colisores, eu uso a caixa delimitadora
              //ao redor da posição anterior e da posição atual
              //isso é independente do tipo de colisor

              //o centro é a média dos centros de colisão
              var c = createVector(
                (this.position.x+this.previousPosition.x)/2,
                (this.position.y+this.previousPosition.y)/2);

              //as extensões são as distâncias entre os centros de colisão
              //mais as extensões de ambos
              var e = createVector(
                abs(this.position.x -this.previousPosition.x) + this.collider.extents.x,
                abs(this.position.y -this.previousPosition.y) + this.collider.extents.y);

              var bbox = new AABB(pInst, c, e, this.collider.offset);

              //bbox.draw();

              if(bbox.overlap(other.collider))
              {
                if(tunnelX) {

                  //entrando da direita
                  if(this.velocity.x < 0)
                    displacement.x = other.collider.right() - this.collider.left() + 1;
                  else if(this.velocity.x > 0 )
                    displacement.x = other.collider.left() - this.collider.right() -1;
                  }

                if(tunnelY) {
                  //do topo
                  if(this.velocity.y > 0)
                    displacement.y = other.collider.top() - this.collider.bottom() - 1;
                  else if(this.velocity.y < 0 )
                    displacement.y = other.collider.bottom() - this.collider.top() + 1;

                  }

              }//fim da sobreposição

            }
            else //sobreposição sem túneis
            {

              //se o outro for um círculo, eu calculo a substituição a partir daqui
              //e reverto ela
              if(this.collider instanceof CircleCollider)
                {
                displacement = other.collider.collide(this.collider).mult(-1);
                }
              else
                displacement = this.collider.collide(other.collider);

            }

            if(displacement.x !== 0 || displacement.y !== 0)
            {
              var newVelX1, newVelY1, newVelX2, newVelY2;

              if (type === 'displace' && !other.immovable) {
                other.position.sub(displacement);
              } else if ((type === 'collide' || type === 'bounce') && !this.immovable) {
                this.position.add(displacement);
                this.previousPosition = createVector(this.position.x, this.position.y);
                this.newPosition = createVector(this.position.x, this.position.y);
              }

              if(displacement.x > 0)
                this.touching.left = true;
              if(displacement.x < 0)
                this.touching.right = true;
              if(displacement.y < 0)
                this.touching.bottom = true;
              if(displacement.y > 0)
                this.touching.top = true;

              if(type === 'bounce')
              {
                if (this.collider instanceof CircleCollider && other.collider instanceof CircleCollider) {
                  var dx1 = p5.Vector.sub(this.position, other.position);
                  var dx2 = p5.Vector.sub(other.position, this.position);
                  var magnitude = dx1.magSq();
                  var totalMass = this.mass + other.mass;
                  var m1 = 0, m2 = 0;
                  if (this.immovable) {
                    m2 = 2;
                  } else if (other.immovable) {
                    m1 = 2;
                  } else {
                    m1 = 2 * other.mass / totalMass;
                    m2 = 2 * this.mass / totalMass;
                  }
                  var newVel1 = dx1.mult(m1 * p5.Vector.sub(this.velocity, other.velocity).dot(dx1) / magnitude);
                  var newVel2 = dx2.mult(m2 * p5.Vector.sub(other.velocity, this.velocity).dot(dx2) / magnitude);

                  this.velocity.sub(newVel1.mult(this.restitution));
                  other.velocity.sub(newVel2.mult(other.restitution));
                }
                else {
                if(other.immovable)
                {
                  newVelX1 = -this.velocity.x+other.velocity.x;
                  newVelY1 = -this.velocity.y+other.velocity.y;
                }
                else
                {
                  newVelX1 = (this.velocity.x * (this.mass - other.mass) + (2 * other.mass * other.velocity.x)) / (this.mass + other.mass);
                  newVelY1 = (this.velocity.y * (this.mass - other.mass) + (2 * other.mass * other.velocity.y)) / (this.mass + other.mass);
                  newVelX2 = (other.velocity.x * (other.mass - this.mass) + (2 * this.mass * this.velocity.x)) / (this.mass + other.mass);
                  newVelY2 = (other.velocity.y * (other.mass - this.mass) + (2 * this.mass * this.velocity.y)) / (this.mass + other.mass);
                }

                //var bothCircles = (this.collider instanceof CircleCollider &&
                //                   other.collider  instanceof CircleCollider);

                //if(this.touching.left || this.touching.right || this.collider instanceof CircleCollider)

                //print(displacement);

                if(abs(displacement.x)>abs(displacement.y))
                {


                  if(!this.immovable)
                  {
                    this.velocity.x = newVelX1*this.restitution;

                  }

                  if(!other.immovable)
                    other.velocity.x = newVelX2*other.restitution;

                }
                //if(this.touching.top || this.touching.bottom || this.collider instanceof CircleCollider)
                if(abs(displacement.x)<abs(displacement.y))
                {

                  if(!this.immovable)
                    this.velocity.y = newVelY1*this.restitution;

                  if(!other.immovable)
                    other.velocity.y = newVelY2*other.restitution;
                }
                }
              }
              //else if(type == "collide")
                //this.velocity = createVector(0,0);

              if(callback !== undefined && typeof callback === 'function')
                callback.call(this, this, other);

              result = true;
            }
          }
        }//fim de colisor existe
      }

    return result;
  };
} //fim da Classe Sprite

defineLazyP5Property('Sprite', boundConstructorFactory(Sprite));

/**
   * Uma câmera facilita a rolagem e o zoom para cenas que vão além
   * a tela. Uma câmera tem uma posição, um fator de zoom e as coordenadas
   * do mouse relativas à vista.
   * A câmera é criada automaticamente no primeiro ciclo de desenho.
   *
   * Em termos de p5.js, a câmera envolve todo o ciclo de desenho em uma
   * matriz de transformação, mas pode ser desativada a qualquer momento durante o ciclo
   * de desenho, por exemplo, para desenhar os elementos da interface em uma posição absoluta.
   *
   * @class Camera
   * @constructor
   * @param {Number} x Coordenada x inicial
   * @param {Number} y Coordenada y inicial
   * @param {Number} zoom ampliação
   **/
function Camera(pInst, x, y, zoom) {
  /**
  * Posição da câmera. Define o deslocamento global do sketch.
  *
  * @property position
  * @type {p5.Vector}
  */
  this.position = pInst.createVector(x, y);

  /**
  * Zoom da câmera. Define a escala global do sketch.
  * Uma escala de 1 será o tamanho normal. Configurá-lo para 2 fará com que tudo
  * fique com duas vezes o tamanho. .5 fará com que tudo fique com a metade do tamanho.
  *
  * @property zoom
  * @type {Number}
  */
  this.zoom = zoom;

  /**
  * MouseX traduzido para a visão da câmera.
  * Deslocar e dimensionar a tela não mudará a posição dos sprites
  * nem as variáveis mouseX e mouseY. Use esta propriedade para ler a posição
  * do mouse, se a câmera se moveu ou ampliou.
  *
  * @property mouseX
  * @type {Number}
  */
  this.mouseX = pInst.mouseX;

  /**
  * MouseY traduzido para a visão da câmera.
  * Deslocar e dimensionar a tela não mudará a posição dos sprites
  * nem as variáveis mouseX e mouseY. Use esta propriedade para ler a posição
  * do mouse, se a câmera se moveu ou ampliou.
  *
  * @property mouseY
  * @type {Number}
  */
  this.mouseY = pInst.mouseY;

  /**
  * Verdadeiro se a câmera estiver ativa.
  * Propriedade somente de leitura. Use os métodos Camera.on() e Camera.off()
  * para ativar ou desativar a câmera.
  *
  * @property active
  * @type {Boolean}
  */
  this.active = false;

  /**
  * Ativa a câmera.
  * A tela será desenhada de acordo com a posição da câmera e escala até
  * Camera.off() ser chamado
  *
  * @method on
  */
  this.on = function() {
    if(!this.active)
    {
      cameraPush.call(pInst);
      this.active = true;
    }
  };

  /**
  * Desativa a câmera.
  * A tela será desenhada normalmente, ignorando a posição da câmera
  * e dimensão até que Camera.on() seja chamado
  *
  * @method off
  */
  this.off = function() {
    if(this.active)
    {
      cameraPop.call(pInst);
      this.active = false;
    }
  };
} //fim da Classe Camera

defineLazyP5Property('Camera', boundConstructorFactory(Camera));

//chamado pre desenho por padrão
function cameraPush() {
  var pInst = this;
  var camera = pInst.camera;

  //estranho, mas necessário para ter a câmera no centro
  // da tela por padrão
  if(!camera.init && camera.position.x === 0 && camera.position.y === 0)
    {
    camera.position.x=pInst.width/2;
    camera.position.y=pInst.height/2;
    camera.init = true;
    }

  camera.mouseX = pInst.mouseX+camera.position.x-pInst.width/2;
  camera.mouseY = pInst.mouseY+camera.position.y-pInst.height/2;

  if(!camera.active)
  {
    camera.active = true;
    pInst.push();
    pInst.scale(camera.zoom);
    pInst.translate(-camera.position.x+pInst.width/2/camera.zoom, -camera.position.y+pInst.height/2/camera.zoom);
  }
}

//chamado pós desenho por padrão
function cameraPop() {
  var pInst = this;

  if(pInst.camera.active)
  {
    pInst.pop();
    pInst.camera.active = false;
  }
}




/**
   * Em p5.play, groupos são coleções de sprites com comportamento semelhante.
   * Por exemplo, um grupo pode conter todos os sprites no plano de fundo
   * ou todos os sprites que "matam" o jogador.
   *
   * Os grupos são matrizes "estendidas" e herdam todas as suas propriedades
   * por exemplo: group.length
   *
   * Uma vez que os grupos contêm apenas referências, um sprite pode estar em vários
   * grupos e deletar um grupo não afeta os próprios sprites.
   *
   * Sprite.remove() também removerá o sprite de todos os grupos
   * que ele pertence.
   *
   * @class Group
   * @constructor
   */
function Group() {

  ////basicamente estendendo a matriz
  var array = [];

  /**
  * Obtém o membro no índice i.
  *
  * @method get
  * @param {Number} i O índice do objeto a ser recuperado
  */
  array.get = function(i) {
    return array[i];
  };

  /**
  * Verifica se o grupo contém um sprite.
  *
  * @method contains
  * @param {Sprite} sprite O sprite a ser procurado
  * @return {Number} Índice ou -1 se não for encontrado
  */
  array.contains = function(sprite) {
    return this.indexOf(sprite)>-1;
  };

  /**
   * O mesmo que Group.contains
   * @method indexOf
   */
  array.indexOf = function(item) {
    for (var i = 0, len = array.length; i < len; ++i) {
      if (virtEquals(item, array[i])) {
        return i;
      }
    }
    return -1;
  };

  /**
  * Adiciona um sprite ao grupo.
  *
  * @method add
  * @param {Sprite} s O sprite a ser adicionado
  */
  array.add = function(s) {
    if(!(s instanceof Sprite)) {
      throw('Error: you can only add sprites to a group');
    }

    if (-1 === this.indexOf(s)) {
      array.push(s);
      s.groups.push(this);
    }
  };

  /**
   * O mesmo que group.length
   * @method size
   */
  array.size = function() {
    return array.length;
  };

  /**
  * Remove todos os sprites do grupo
  * da cena.
  *
  * @method removeSprites
  */
  array.removeSprites = function() {
    while (array.length > 0) {
      array[0].remove();
    }
  };

  /**
  * Remove todas as referências ao grupo.
  * Não remove os sprites de verdade.
  *
  * @method clear
  */
  array.clear = function() {
    array.length = 0;
  };

  /**
  * Remove um sprite do grupo.
  * Não remove o sprite de verdade, apenas a afiliação (referência).
  *
  * @method remove
  * @param {Sprite} item O sprite a ser removido
  * @return {Boolean} Verdadeiro se sprite foi encontrado e removido
  */
  array.remove = function(item) {
    if(!(item instanceof Sprite)) {
      throw('Error: you can only remove sprites from a group');
    }

    var i, removed = false;
    for (i = array.length - 1; i >= 0; i--) {
      if (array[i] === item) {
        array.splice(i, 1);
        removed = true;
      }
    }

    if (removed) {
      for (i = item.groups.length - 1; i >= 0; i--) {
        if (item.groups[i] === this) {
          item.groups.splice(i, 1);
        }
      }
    }

    return removed;
  };

  /**
   * Retorna uma cópia do grupo como uma matriz padrão.
   * @method toArray
   */
  array.toArray = function() {
    return array.slice(0);
  };

  /**
  * Retorna a maior profundidade em um grupo
  *
  * @method maxDepth
  * @return {Number} A profundidade do sprite desenhado na parte superior
  */
  array.maxDepth = function() {
    if (array.length === 0) {
      return 0;
    }

    return array.reduce(function(maxDepth, sprite) {
      return Math.max(maxDepth, sprite.depth);
    }, -Infinity);
  };

  /**
  * Retorna a menor profundidade em um grupo
  *
  * @method minDepth
  * @return {Number} A profundidade do sprite desenhado na parte inferior
  */
  array.minDepth = function() {
    if (array.length === 0) {
      return 99999;
    }

    return array.reduce(function(minDepth, sprite) {
      return Math.min(minDepth, sprite.depth);
    }, Infinity);
  };

  /**
  * Desenha todos os sprites do grupo.
  *
  * @method draw
  */
  array.draw = function() {

    //classificar por profundidade
    this.sort(function(a, b) {
      return a.depth - b.depth;
    });

    for(var i = 0; i<this.size(); i++)
    {
      this.get(i).display();
    }
  };

  //uso interno
  function virtEquals(obj, other) {
    if (obj === null || other === null) {
      return (obj === null) && (other === null);
    }
    if (typeof (obj) === 'string') {
      return obj === other;
    }
    if (typeof(obj) !== 'object') {
      return obj === other;
    }
    if (obj.equals instanceof Function) {
      return obj.equals(other);
    }
    return obj === other;
  }

  /**
   * Colide cada membro do grupo contra o alvo usando a colisão dada
   * modelo. Retorne verdadeiro se ocorrer alguma colisão.
   * uso interno
   *
   * @private
   * @method _groupCollide
   * @param {!string} type um de 'overlap', 'collide', 'displace', 'bounce' ou 'bounceOff'
   * @param {Object} target Grupo ou Sprite
   * @param {Function} [callback] em colisão.
   * @return {boolean} Verdadeiro se qualquer colisão/sobreposição ocorrer
   */
  function _groupCollide(type, target, callback) {
    var didCollide = false;
    for(var i = 0; i<this.size(); i++)
      didCollide = this.get(i).AABBops(type, target, callback) || didCollide;
    return didCollide;
  }

  /**
  * Verifica se o grupo está sobrepondo outro grupo ou sprite.
  * A verificação é feita usando os colisores. Se os colisores não estiverem definidos
  * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
  *
  * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
  * quando ocorre a sobreposição.
  * A função será chamada para cada sobreposição de sprites.
  * Os parâmetros da função são respectivamente o
  * membro do grupo atual e outro sprite passado como parâmetro.
  *
  * @example
  *     group.overlap(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method overlap
  * @param {Object} target Grupo ou Sprite para comparar com o atual
  * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
  * @return {Boolean} True se sobrepondo
  */
  array.overlap = _groupCollide.bind(array, 'overlap');


  /**
  * Verifica se o grupo está se sobrepondo a outro grupo ou sprite.
  * Se a sobreposição for positiva, os sprites no grupo mudarão de posição
  * com o que colide, indo para a posição não-sobreposta mais próxima.
  *
  * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
  * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
  *
  * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
  * quando ocorre a sobreposição.
  * A função será chamada para cada sobreposição de sprites.
  * Os parâmetros da função são respectivamente os
  * membro do grupo atual e outro sprite passado como parâmetro.
  *
  * @example
  *     group.collide(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method collide
  * @param {Object} target Grupo ou Sprite para comparar com o atual
  * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
  * @return {Boolean} True se sobrepondo
  */
  array.collide = _groupCollide.bind(array, 'collide');

  /**
  * Verifica se o grupo está se sobrepondo a outro grupo ou sprite.
  * Se a sobreposição for positiva, os sprites no grupo mudarão de posição
  * com o que colide, indo para a posição não-sobreposta mais próxima.
  *
  * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
  * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
  *
  * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
  * quando ocorre a sobreposição.
  * A função será chamada para cada sobreposição de sprites.
  * Os parâmetros da função são respectivamente os
  * membro do grupo atual e outro sprite passado como parâmetro.
  *
  * @example
  *     group.displace(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method displace
  * @param {Object} target Grupo ou Sprite para comparar com o atual
  * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
  * @return {Boolean} True se sobrepondo
  */
  array.displace = _groupCollide.bind(array, 'displace');

  /**
  * Verifica se o grupo está se sobrepondo a outro grupo ou sprite.
  * Se a sobreposição for positiva, os sprites no grupo mudarão de posição
  * com o que colide, indo para a posição não-sobreposta mais próxima.
  *
  * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
  * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
  *
  * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
  * quando ocorre a sobreposição.
  * A função será chamada para cada sobreposição de sprites.
  * Os parâmetros da função são respectivamente os
  * membro do grupo atual e outro sprite passado como parâmetro.
  *
  * @example
  *     group.displace(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method displace
  * @param {Object} target Grupo ou Sprite para comparar com o atual
  * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
  * @return {Boolean} True se sobrepondo
  */
  array.bounce = _groupCollide.bind(array, 'bounce');

  return array;
}

p5.prototype.Group = Group;

//colisor círculo - usado internamente
function CircleCollider(pInst, _center, _radius, _offset) {
  var pInstBind = createPInstBinder(pInst);

  var createVector = pInstBind('createVector');

  var CENTER = p5.prototype.CENTER;

  this.center = _center;
  this.radius = _radius;
  this.originalRadius = _radius;

  if(_offset === undefined)
    this.offset = createVector(0, 0);
  else
    this.offset = _offset;
  this.extents = createVector(_radius*2, _radius*2);

  this.draw = function()
  {
    pInst.noFill();
    pInst.stroke(0, 255, 0);
    pInst.rectMode(CENTER);
    pInst.ellipse(this.center.x+this.offset.x, this.center.y+this.offset.y, this.radius*2, this.radius*2);
  };

  //deve ser chamada apenas para círculo vs círculo
  this.overlap = function(other)
  {
    //distância de quadrado
    var r = this.radius + other.radius;
    r *= r;
    var thisCenterX = this.center.x + this.offset.x;
    var thisCenterY = this.center.y + this.offset.y;
    var otherCenterX = other.center.x + other.offset.x;
    var otherCenterY = other.center.y + other.offset.y;
    var sqDist = pow(thisCenterX - otherCenterX, 2) + pow(thisCenterY - otherCenterY, 2);
    return r > sqDist;
  };

  //deve ser chamada apenas para círculo vs círculo
  this.collide = function(other)
  {
    if(this.overlap(other)) {
      var thisCenterX = this.center.x + this.offset.x;
      var thisCenterY = this.center.y + this.offset.y;
      var otherCenterX = other.center.x + other.offset.x;
      var otherCenterY = other.center.y + other.offset.y;
      var a = pInst.atan2(thisCenterY-otherCenterY, thisCenterX-otherCenterX);
      var radii = this.radius+other.radius;
      var intersection = abs(radii - dist(thisCenterX, thisCenterY, otherCenterX, otherCenterY));

      var displacement = createVector(pInst.cos(a)*intersection, pInst.sin(a)*intersection);

      return displacement;
    } else {
      return createVector(0, 0);
    }
  };

  this.size = function()
  {
    return createVector(this.radius*2, this.radius*2);
  };

  this.left = function()
  {
    return this.center.x+this.offset.x - this.radius;
  };

  this.right = function()
  {
    return this.center.x+this.offset.x + this.radius;
  };

  this.top = function()
  {
    return this.center.y+this.offset.y - this.radius;
  };

  this.bottom = function()
  {
    return this.center.y+this.offset.y + this.radius;
  };



}
defineLazyP5Property('CircleCollider', boundConstructorFactory(CircleCollider));

//caixa de delimitação alinhada ao texto - extensões são de metade do tamanho - usado internamente
function AABB(pInst, _center, _extents, _offset) {
  var pInstBind = createPInstBinder(pInst);

  var createVector = pInstBind('createVector');

  var CENTER = p5.prototype.CENTER;
  var PI = p5.prototype.PI;

  this.center = _center;
  this.extents = _extents;
  this.originalExtents = _extents.copy();

  if(_offset === undefined)
    this.offset = createVector(0, 0);
  else
    this.offset = _offset;

  this.min = function()
  {
    return createVector(this.center.x+this.offset.x - this.extents.x, this.center.y+this.offset.y - this.extents.y);
  };

  this.max = function()
  {
    return createVector(this.center.x+this.offset.x + this.extents.x, this.center.y+this.offset.y + this.extents.y);
  };

  this.right = function()
  {
    return this.center.x+this.offset.x + this.extents.x/2;
  };

  this.left = function()
  {
    return this.center.x+this.offset.x - this.extents.x/2;
  };

  this.top = function()
  {
    return this.center.y+this.offset.y - this.extents.y/2;
  };

  this.bottom = function()
  {
    return this.center.y+this.offset.y + this.extents.y/2;
  };

  this.size = function()
  {
    return createVector(this.extents.x * 2, this.extents.y * 2);
  };

  this.rotate = function(r)
  {
    //rotacionar a caixa de delimitação
    var t;
    if (pInst._angleMode === pInst.RADIANS) {
      t = radians(r);
    } else {
      t = r;
    }

    var w2 = this.extents.x * abs(pInst.cos(t)) + this.extents.y * abs(pInst.sin(t));
    var h2 = this.extents.x * abs(pInst.sin(t)) + this.extents.y * abs(pInst.cos(t));

    this.extents.x = w2;
    this.extents.y = h2;

  };

  this.draw = function()
  {
    //fill(col);
    pInst.noFill();
    pInst.stroke(0, 255, 0);
    pInst.rectMode(CENTER);
    pInst.rect(this.center.x+this.offset.x, this.center.y+this.offset.y, this.size().x/2, this.size().y/2);
  };

  this.overlap = function(other)
  {
    //caixa vs caixa
    if(other instanceof AABB)
    {
      var md = other.minkowskiDifference(this);

      if (md.min().x <= 0 &&
          md.max().x >= 0 &&
          md.min().y <= 0 &&
          md.max().y >= 0)
      {
        return true;
      }
      else
        return false;
    }
    //caixa vs círculo
    else if(other instanceof CircleCollider)
    {

      //encontrar o ponto mais próximo do círculo na caixa
      var pt = createVector(other.center.x, other.center.y);

      //Eu não sei o que está acontecendo tentando traçar uma linha dos centros para ver
      if( other.center.x < this.left() )
        pt.x = this.left();
      else if( other.center.x > this.right())
        pt.x = this.right();

      if( other.center.y < this.top() )
        pt.y = this.top();
      else if( other.center.y > this.bottom())
        pt.y = this.bottom();

      var distance = pt.dist(other.center);

      return distance<other.radius;
    }
  };

  this.collide = function(other)
  {

    if(other instanceof AABB)
    {
      var md = other.minkowskiDifference(this);

      if (md.min().x <= 0 &&
          md.max().x >= 0 &&
          md.min().y <= 0 &&
          md.max().y >= 0)
      {
        var boundsPoint = md.closestPointOnBoundsToPoint(createVector(0, 0));

        return boundsPoint;
      }
      else
        return createVector(0, 0);
    }
    //caixa vs círculo
    else if(other instanceof CircleCollider)
    {

      //encontrar ponto mais próximo do círculo na caixa
      var pt = createVector(other.center.x, other.center.y);

      //Eu não sei o que está acontecendo tentando traçar uma linha dos centros para ver
      if( other.center.x < this.left() )
        pt.x = this.left();
      else if( other.center.x > this.right())
        pt.x = this.right();

      if( other.center.y < this.top() )
        pt.y = this.top();
      else if( other.center.y > this.bottom())
        pt.y = this.bottom();


      var distance = pt.dist(other.center);
      var a;

      if(distance<other.radius)
      {
        //ponto de refixar
        if(pt.x === other.center.x && pt.y === other.center.y)
        {
          var xOverlap = pt.x - this.center.x;
          var yOverlap = pt.y - this.center.y;


          if(abs(xOverlap) < abs(yOverlap))
          {
            if(xOverlap > 0 )
              pt.x = this.right();
            else
              pt.x = this.left();
          }
          else
          {
            if(yOverlap < 0 )
              pt.y = this.top();
            else
              pt.y = this.bottom();
          }

          a = pInst.atan2(other.center.y-pt.y, other.center.x-pt.x);

          //exceções fixas
          if(a === 0)
          {
            if(pt.x === this.right()) a = PI;
            if(pt.y === this.top()) a = PI/2;
            if(pt.y === this.bottom()) a = -PI/2;
          }
        }
        else
        {
          //ângulo entre ponto e centro
          a = pInst.atan2(pt.y-other.center.y, pt.x-other.center.x);
          //projetar normal (linha entre ponto e centro) no círculo
        }

        var d = createVector(pt.x-other.center.x, pt.y-other.center.y);
        var displacement = createVector(pInst.cos(a)*other.radius-d.x, pInst.sin(a)*other.radius-d.y);

        //if(pt.x === other.center.x && pt.y === other.center.y)
        //displacement = displacement.mult(-1);

        return displacement;
        //retornar createVector(0,0);
      }
      else
        return createVector(0, 0);
    }
  };

  this.minkowskiDifference = function(other)
  {
    var topLeft = this.min().sub(other.max());
    var fullSize = this.size().add(other.size());
    return new AABB(pInst, topLeft.add(fullSize.div(2)), fullSize.div(2));
  };


  this.closestPointOnBoundsToPoint = function(point)
  {
    // teste x primeiro
    var minDist = abs(point.x - this.min().x);
    var boundsPoint = createVector(this.min().x, point.y);

    if (abs(this.max().x - point.x) < minDist)
    {
      minDist = abs(this.max().x - point.x);
      boundsPoint = createVector(this.max().x, point.y);
    }

    if (abs(this.max().y - point.y) < minDist)
    {
      minDist = abs(this.max().y - point.y);
      boundsPoint = createVector(point.x, this.max().y);
    }

    if (abs(this.min().y - point.y) < minDist)
    {
      minDist = abs(this.min.y - point.y);
      boundsPoint = createVector(point.x, this.min().y);
    }

    return boundsPoint;
  };


}//fim AABB
defineLazyP5Property('AABB', boundConstructorFactory(AABB));



/**
 * Um objeto de animação contém uma série de imagens (p5.Image) que
 * pode ser exibido sequencialmente.
 *
 * Todos os arquivos devem ser imagens PNG. Você deve incluir o diretório da raiz do esboço,
 * e a extensão .png
 *
 * Um sprite pode ter várias animações rotuladas, consulte Sprite.addAnimation
 * e Sprite.changeAnimation, no entanto, uma animação pode ser usada independentemente.
 *
 * Uma animação pode ser criada passando uma série de nomes de arquivo,
 * não importa quantos ou passando o primeiro e o último nome de arquivo
 * de uma sequência numerada.
 * p5.play tentará detectar o padrão de sequência.
 *
 * Por exemplo, se os nomes dos arquivos dados são
 * "data/file0001.png" e "data/file0005.png" as imagens
 * "data/file0003.png" e "data/file0004.png" também serão carregadas.
 *
 * @example
 *     var sequenceAnimation;
 *     var glitch;
 *
 *     function preload() {
 *       sequenceAnimation = loadAnimation("data/walking0001.png", "data/walking0005.png");
 *       glitch = loadAnimation("data/dog.png", "data/horse.png", "data/cat.png", "data/snake.png");
 *     }
 *
 *     function setup() {
 *       createCanvas(800, 600);
 *     }
 *
 *     function draw() {
 *       background(0);
 *       animation(sequenceAnimation, 100, 100);
 *       animation(glitch, 200, 100);
 *     }
 *
 * @class Animation
 * @constructor
 * @param {String} fileName1 Primeiro arquivo em uma sequência OU primeiro arquivo de imagem
 * @param {String} fileName2 Último arquivo em uma sequência OU segundo arquivo de imagem
 * @param {String} [...fileNameN] Qualquer número de arquivos de imagem após os dois primeiros
 */
function Animation(pInst) {
  var frameArguments = Array.prototype.slice.call(arguments, 1);
  var i;

  var CENTER = p5.prototype.CENTER;

  /**
  * Matriz de quadros (p5.Image)
  *
  * @property images
  * @type {Array}
  */
  this.images = [];

  var frame = 0;
  var cycles = 0;
  var targetFrame = -1;

  this.offX = 0;
  this.offY = 0;

  /**
  * Atraso entre os quadros em número de ciclos de desenho.
  * Se definido como 4, a taxa de quadros da animação seria
  * o esboço do sketch divido por 4 (60fps = 15fps)
  *
  * @property frameDelay
  * @type {Number}
  * @default 4
  */
  this.frameDelay = 4;

  /**
  * True se a animação estiver sendo reproduzida.
  *
  * @property playing
  * @type {Boolean}
  * @default true
  */
  this.playing = true;

  /**
  * Visibilidade da animação.
  *
  * @property visible
  * @type {Boolean}
  * @default true
  */
  this.visible = true;

  /**
  * Se for definido como falso, a animação irá parar após atingir o último quadro
  *
  * @property looping
  * @type {Boolean}
  * @default true
  */
  this.looping = true;

  /**
  * True se o quadro mudou durante o último ciclo de desenho
  *
  * @property frameChanged
  * @type {Boolean}
  */
  this.frameChanged = false;

  // é o colisor definido manualmente ou definido
 // pelo tamanho do quadro atual
  this.imageCollider = false;


  ///modo de sequência
  if(frameArguments.length === 2 && typeof frameArguments[0] === 'string' && typeof frameArguments[1] === 'string')
  {
    var from = frameArguments[0];
    var to = frameArguments[1];

    //print("sequence mode "+from+" -> "+to);

    //certifique-se de que as extensões estão corretas
    var ext1 = from.substring(from.length-4, from.length);
    if(ext1 !== '.png')
    {
      pInst.print('Animation error: you need to use .png files (filename '+from+')');
      from = -1;
    }

    var ext2 = to.substring(to.length-4, to.length);
    if(ext2 !== '.png')
    {
      pInst.print('Animation error: you need to use .png files (filename '+to+')');
      to = -1;
    }

    //extensões estão bem
    if(from !== -1 && to !== -1)
    {
      var digits1 = 0;
      var digits2 = 0;

      //pule extensão e trabalhe voltando para frente para encontrar os números
      for (i = from.length-5; i >= 0; i--) {
        if(from.charAt(i) >= '0' && from.charAt(i) <= '9')
          digits1++;
      }

      for (i = to.length-5; i >= 0; i--) {
        if(to.charAt(i) >= '0' && to.charAt(i) <= '9')
          digits2++;
      }

      var prefix1 = from.substring(0, from.length-(4+digits1));
      var prefix2 = to.substring(0, to.length-(4+digits2) );

      // Nossos números provavelmente têm zeros à esquerda, o que significa que alguns
      // navegadores (por exemplo, PhantomJS) irão interpretá-los como base 8 (octal),
      // em vez de decimal. Para corrigir isso, diremos explicitamente ao parseInt para
      // usar uma base 10 (decimal). Para obter mais detalhes sobre este problema, consulte
      // http://stackoverflow.com/a/8763427/2422398.
      var number1 = parseInt(from.substring(from.length-(4+digits1), from.length-4), 10);
      var number2 = parseInt(to.substring(to.length-(4+digits2), to.length-4), 10);

      //trocar se invertido
      if(number2<number1)
      {
        var t = number2;
        number2 = number1;
        number1 = t;
      }

      //dois quadros diferentes
      if(prefix1 !== prefix2 )
      {
        //print("2 separate images");
        this.images.push(pInst.loadImage(from));
        this.images.push(pInst.loadImage(to));
      }
      //mesmos dígitos: caso img0001, img0002
      else
      {
        var fileName;
        if(digits1 === digits2)
        {

          //carregar todas as imagens
          for (i = number1; i <= number2; i++) {
            // Use nf() para numerar o formato 'i' em quatro dígitos
            fileName = prefix1 + pInst.nf(i, digits1) + '.png';
            this.images.push(pInst.loadImage(fileName));

          }

        }
        else //case: case img1, img2
        {
          //print("from "+prefix1+" "+number1 +" to "+number2);
          for (i = number1; i <= number2; i++) {
            // Use nf() para numerar o formato 'i' em quatro dígitos
            fileName = prefix1 + i + '.png';
            this.images.push(pInst.loadImage(fileName));

          }

        }
      }

    }//fim de sem erro externo

  }//fim do modo de sequência
  // Modo de planilha Sprite
  else if (frameArguments.length === 1 && (frameArguments[0] instanceof SpriteSheet))
  {
    this.spriteSheet = frameArguments[0];
    this.images = this.spriteSheet.frames;
  }
  else if(frameArguments.length !== 0)//lista arbitrária de imagens
  {
    //print("Animation arbitrary mode");
    for (i = 0; i < frameArguments.length; i++) {
      //print("loading "+fileNames[i]);
      if(frameArguments[i] instanceof p5.Image)
        this.images.push(frameArguments[i]);
      else
        this.images.push(pInst.loadImage(frameArguments[i]));
    }
  }

  /**
  *  Objetos são passados por referência para ter sprites diferentes
  * usando a mesma animação que você precisa para cloná-lo.
  *
  * @method clone
  * @return {Animation} Um clone da animação atual
  */
  this.clone = function() {
    var myClone = new Animation(pInst); //empty
    myClone.images = [];

    if (this.spriteSheet) {
      myClone.spriteSheet = this.spriteSheet.clone();
    }
    myClone.images = this.images.slice();

    myClone.offX = this.offX;
    myClone.offY = this.offY;
    myClone.frameDelay = this.frameDelay;
    myClone.playing = this.playing;
    myClone.looping = this.looping;

    return myClone;
  };

  /**
   * Desenha a animação nas coordenadas x e y.
   * Atualiza os quadros automaticamente.
   *
   * @method draw
   * @param {Number} x coordenada x
   * @param {Number} y coordenada y
   * @param {Number} [r=0] rotação
   */
  this.draw = function(x, y, r) {
    this.xpos = x;
    this.ypos = y;
    this.rotation = r || 0;

    if (this.visible)
    {

      //apenas conexão com a classe sprite
      //se a animação for usada de forma independente, desenhar e atualizar são o mesmo
      if(!this.isSpriteAnimation)
        this.update();

      //this.currentImageMode = g.imageMode;
      pInst.push();
      pInst.imageMode(CENTER);

      pInst.translate(this.xpos, this.ypos);
      if (pInst._angleMode === pInst.RADIANS) {
        pInst.rotate(radians(this.rotation));
      } else {
        pInst.rotate(this.rotation);
      }

      if(this.images[frame] !== undefined)
      {
        if (this.spriteSheet) {
          var frame_info = this.images[frame].frame;
          pInst.image(this.spriteSheet.image, frame_info.x, frame_info.y, frame_info.width,
            frame_info.height, this.offX, this.offY, frame_info.width, frame_info.height);
        } else {
          pInst.image(this.images[frame], this.offX, this.offY);
        }
      }
      else
      {
        pInst.print('Warning undefined frame '+frame);
        //this.isActive = false;
      }

      pInst.pop();
    }
  };

  //chamado por desenho
  this.update = function() {
    cycles++;
    var previousFrame = frame;
    this.frameChanged = false;


    //vá para o quadro
    if(this.images.length === 1)
    {
      this.playing = false;
      frame = 0;
    }

    if ( this.playing && cycles%this.frameDelay === 0)
    {
      //indo para o quadro alto do alvo
      if(targetFrame>frame && targetFrame !== -1)
      {
        frame++;
      }
      //indo para o quadro baixo do alvo
      else if(targetFrame<frame && targetFrame !== -1)
      {
        frame--;
      }
      else if(targetFrame === frame && targetFrame !== -1)
      {
        this.playing=false;
      }
      else if (this.looping) //quadro avançado
      {
        //se o próximo quadro for muito alto
        if (frame>=this.images.length-1)
          frame = 0;
        else
          frame++;
      } else
      {
        //se o próximo quadro for muito alto
        if (frame<this.images.length-1)
          frame++;
      }
    }

    if(previousFrame !== frame)
      this.frameChanged = true;

  };//fim da atualização

  /**
  * Reproduz a animação.
  *
  * @method play
  */
  this.play = function() {
    this.playing = true;
    targetFrame = -1;
  };

  /**
  * Para a animação.
  *
  * @method stop
  */
  this.stop = function(){
    this.playing = false;
  };

  /**
  * Retrocede a animação para o primeiro quadro.
  *
  * @method rewind
  */
  this.rewind = function() {
    frame = 0;
  };

  /**
  * Altera o quadro atual.
  *
  * @method changeFrame
  * @param {Number} frame Número do quadro (começa em 0).
  */
  this.changeFrame = function(f) {
    if (f<this.images.length)
      frame = f;
    else
      frame = this.images.length - 1;

    targetFrame = -1;
    //this.playing = false;
  };

   /**
  * Vai para o próximo quadro e para.
  *
  * @method nextFrame
  */
  this.nextFrame = function() {

    if (frame<this.images.length-1)
      frame = frame+1;
    else if(this.looping)
      frame = 0;

    targetFrame = -1;
    this.playing = false;
  };

   /**
  * Vai para o quadro anterior e para.
  *
  * @method previousFrame
  */
  this.previousFrame = function() {

    if (frame>0)
      frame = frame-1;
    else if(this.looping)
      frame = this.images.length-1;

    targetFrame = -1;
    this.playing = false;
  };

  /**
  * Reproduz a animação para frente ou para trás em direção a um quadro de destino.
  *
  * @method goToFrame
  * @param {Number} toFrame Destino do número do quadro (começa em 0)
  */
  this.goToFrame = function(toFrame) {
    if(toFrame < 0 || toFrame >= this.images.length) {
      return;
    }

    // targetFrame é usado pelo método update() para decidir qual próximo
    // quadro selecionar.  Quando não está sendo usado, é definido como -1.
    targetFrame = toFrame;

    if(targetFrame !== frame) {
      this.playing = true;
    }
  };

  /**
  * Retorna o número do quadro atual.
  *
  * @method getFrame
  * @return {Number} Quadro atual (começa em 0)
  */
  this.getFrame = function() {
    return frame;
  };

  /**
  * Retorna o último número do quadro.
  *
  * @method getLastFrame
  * @return {Number} Último número do quadro (começa em 0)
  */
  this.getLastFrame = function() {
    return this.images.length-1;
  };

  /**
  * Retorna a imagem do quadro atual como p5.Image.
  *
  * @method getFrameImage
  * @return {p5.Image} Imagem do quadro atual
  */
  this.getFrameImage = function() {
    return this.images[frame];
  };

  /**
  * Retorna a imagem do quadro no número do quadro especificado.
  *
  * @method getImageAt
  * @param {Number} frame Número do quadro
  * @return {p5.Image} Imagem do quadro
  */
  this.getImageAt = function(f) {
    return this.images[f];
  };

  /**
  * Retorna a largura do quadro atual em pixels.
  * Se não houver imagem carregada, retorna 1.
  *
  * @method getWidth
  * @return {Number} Largura do quadro
  */
  this.getWidth = function() {
    if (this.images[frame] instanceof p5.Image) {
      return this.images[frame].width;
    } else if (this.images[frame]) {
      // Caso especial: Animação-da-planilha-de-sprites trata sua matriz de imagens de maneira diferente.
      return this.images[frame].frame.width;
    } else {
      return 1;
    }
  };

  /**
  * Retorna a altura do quadro atual em pixels.
  * Se não houver imagem carregada, retorna 1.
  *
  * @method getHeight
  * @return {Number} Altura do quadro
  */
  this.getHeight = function() {
    if (this.images[frame] instanceof p5.Image) {
      return this.images[frame].height;
    } else if (this.images[frame]) {
      // Caso especial: Animação-da-planilha-de-sprites trata sua matriz de imagens de maneira diferente.
      return this.images[frame].frame.height;
    } else {
      return 1;
    }
  };

}

defineLazyP5Property('Animation', boundConstructorFactory(Animation));

/**
 * Representa uma planilha de sprite e todos os seus quadros. Para ser usado com animação,
 * ou quadros únicos de desenho estático.
 *
 *  Existem duas maneiras diferentes de carregar uma SpriteSheet
 *
 * 1. Dada a largura, altura que será usada para cada quadro e o
 *    número de quadros para percorrer. A planilha de sprite deve ter uma
 *    grade uniforme com linhas e colunas consistentes.
 *
 * 2. Dada uma série de objetos de quadro que definem a posição e
 *    dimensões de cada quadro. Isso é flexível porque você pode usar
 *    planilhas de sprite que não possuem linhas e colunas uniformes.
 *
 * @example
 *     // Método 1 - Usando largura, altura para cada quadro e número de quadros
 *     explode_sprite_sheet = loadSpriteSheet('assets/explode_sprite_sheet.png', 171, 158, 11);
 *
 *     // Método 2 - Usando uma série de objetos que definem cada quadro
 *     var player_frames = loadJSON('assets/tiles.json');
 *     player_sprite_sheet = loadSpriteSheet('assets/player_spritesheet.png', player_frames);
 *
 * @class SpriteSheet
 * @constructor
 * @param image String caminho da imagem ou objeto p5.Image
 */
function SpriteSheet(pInst) {
  var spriteSheetArgs = Array.prototype.slice.call(arguments, 1);

  this.image = null;
  this.frames = [];
  this.frame_width = 0;
  this.frame_height = 0;
  this.num_frames = 0;

  /**
   * Gere os dados dos frames para esta folha de sprite com base nos parâmetros do usuário
   * @private
   * @method _generateSheetFrames
   */
  this._generateSheetFrames = function() {
    var sX = 0, sY = 0;
    for (var i = 0; i < this.num_frames; i++) {
      this.frames.push(
        {
          'name': i,
          'frame': {
            'x': sX,
            'y': sY,
            'width': this.frame_width,
            'height': this.frame_height
          }
        });
      sX += this.frame_width;
      if (sX >= this.image.width) {
        sX = 0;
        sY += this.frame_height;
        if (sY >= this.image.height) {
          sY = 0;
        }
      }
    }
  };

  if (spriteSheetArgs.length === 2 && Array.isArray(spriteSheetArgs[1])) {
    this.frames = spriteSheetArgs[1];
    this.num_frames = this.frames.length;
  } else if (spriteSheetArgs.length === 4 &&
    (typeof spriteSheetArgs[1] === 'number') &&
    (typeof spriteSheetArgs[2] === 'number') &&
    (typeof spriteSheetArgs[3] === 'number')) {
    this.frame_width = spriteSheetArgs[1];
    this.frame_height = spriteSheetArgs[2];
    this.num_frames = spriteSheetArgs[3];
  }

  if(spriteSheetArgs[0] instanceof p5.Image) {
    this.image = spriteSheetArgs[0];
    if (spriteSheetArgs.length === 4) {
      this._generateSheetFrames();
    }
  } else {
    if (spriteSheetArgs.length === 2) {
      this.image = pInst.loadImage(spriteSheetArgs[0]);
    } else if (spriteSheetArgs.length === 4) {
      this.image = pInst.loadImage(spriteSheetArgs[0], this._generateSheetFrames.bind(this));
    }
  }

  /**
   * Desenha um quadro específico para a tela.
   * @param frame_name  Pode ser um nome de string ou um índice numérico.
   * @param x   posição x para onde desenhar o quadro
   * @param y   posição y para onde desenhar o quadro
   * @param [width]   largura opcional para desenhar a moldura
   * @param [height]  altura opcional para desenhar a moldura
   * @method drawFrame
   */
  this.drawFrame = function(frame_name, x, y, width, height) {
    var frameToDraw;
    if (typeof frame_name === 'number') {
      frameToDraw = this.frames[frame_name].frame;
    } else {
      for (var i = 0; i < this.frames.length; i++) {
        if (this.frames[i].name === frame_name) {
          frameToDraw = this.frames[i].frame;
          break;
        }
      }
    }
    var dWidth = width || frameToDraw.width;
    var dHeight = height || frameToDraw.height;
    pInst.image(this.image, frameToDraw.x, frameToDraw.y,
      frameToDraw.width, frameToDraw.height, x, y, dWidth, dHeight);
  };

  /**
   * Objetos são passados por referência para ter sprites diferentes
   * usando a mesma animação que você precisa para cloná-lo.
   *
   * @method clone
   * @return {SpriteSheet} Um clone do atual SpriteSheet
   */
  this.clone = function() {
    var myClone = new SpriteSheet(pInst); //empty

    // Clone profundamente os quadros por valor, não por referência
    for(var i = 0; i < this.frames.length; i++) {
      var frame = this.frames[i].frame;
      var cloneFrame = {
        'name':frame.name,
        'frame': {
          'x':frame.x,
          'y':frame.y,
          'width':frame.width,
          'height':frame.height
        }
      };
      myClone.frames.push(cloneFrame);
    }

    // clonar outros campos
    myClone.image = this.image;
    myClone.frame_width = this.frame_width;
    myClone.frame_height = this.frame_height;
    myClone.num_frames = this.num_frames;

    return myClone;
  };
}

defineLazyP5Property('SpriteSheet', boundConstructorFactory(SpriteSheet));

//construtor geral para poder alimentar argumentos como matrizes
function construct(constructor, args) {
  function F() {
    return constructor.apply(this, args);
  }
  F.prototype = constructor.prototype;
  return new F();
}





/*
 * Javascript Quadtree
 * baseado em
 * https://github.com/timohausmann/quadtree-js/
 * Copyright © 2012 Timo Hausmann
*/

function Quadtree( bounds, max_objects, max_levels, level ) {

  this.active = true;
  this.max_objects	= max_objects || 10;
  this.max_levels		= max_levels || 4;

  this.level 			= level || 0;
  this.bounds 		= bounds;

  this.objects 		= [];
  this.object_refs	= [];
  this.nodes 			= [];
}

Quadtree.prototype.updateBounds = function() {

  //encontrar área máxima
  var objects = this.getAll();
  var x = 10000;
  var y = 10000;
  var w = -10000;
  var h = -10000;

  for( var i=0; i < objects.length; i++ )
    {
      if(objects[i].position.x < x)
        x = objects[i].position.x;
      if(objects[i].position.y < y)
        y = objects[i].position.y;
      if(objects[i].position.x > w)
        w = objects[i].position.x;
      if(objects[i].position.y > h)
        h = objects[i].position.y;
    }


  this.bounds = {
    x:x,
    y:y,
    width:w,
    height:h
  };
  //print(this.bounds);
};

/*
	 * Divida o nó em 4 subnós
	 */
Quadtree.prototype.split = function() {

  var nextLevel	= this.level + 1,
      subWidth	= Math.round( this.bounds.width / 2 ),
      subHeight 	= Math.round( this.bounds.height / 2 ),
      x 			= Math.round( this.bounds.x ),
      y 			= Math.round( this.bounds.y );

  //nó superior direito
  this.nodes[0] = new Quadtree({
    x	: x + subWidth,
    y	: y,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);

  //nó superior esquerdo
  this.nodes[1] = new Quadtree({
    x	: x,
    y	: y,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);

  //nó inferior esquerdo
  this.nodes[2] = new Quadtree({
    x	: x,
    y	: y + subHeight,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);

  //nó inferior direito
  this.nodes[3] = new Quadtree({
    x	: x + subWidth,
    y	: y + subHeight,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);
};


/*
	 * Determine o quadrante para uma área neste nó
	 */
Quadtree.prototype.getIndex = function( pRect ) {
  if(!pRect.collider)
    return -1;
  else
  {
    var index 				= -1,
        verticalMidpoint 	= this.bounds.x + (this.bounds.width / 2),
        horizontalMidpoint 	= this.bounds.y + (this.bounds.height / 2),

        //pRect pode caber completamente nos quadrantes superiores
        topQuadrant = (colliderBounds.top < horizontalMidpoint && colliderBounds.bottom < horizontalMidpoint),

        //pRect pode caber completamente nos quadrantes inferiores
        bottomQuadrant = (colliderBounds.top > horizontalMidpoint);

    //pRect pode caber completamente nos quadrantes esquerdos
    if (colliderBounds.left < verticalMidpoint && colliderBounds.right < verticalMidpoint ) {
      if( topQuadrant ) {
        index = 1;
      } else if( bottomQuadrant ) {
        index = 2;
      }

      //pRect pode caber completamente nos quadrantes direitos
    } else if( pRect.collider.left() > verticalMidpoint ) {
      if( topQuadrant ) {
        index = 0;
      } else if( bottomQuadrant ) {
        index = 3;
      }
    }

    return index;
  }
};


/*
	 * Insira um objeto no nó. Se o nó
   * excede a capacidade, ele irá dividir e adicionar todos
   * objetos para seus subnós correspondentes.
	 */
Quadtree.prototype.insert = function( obj ) {
  //evite inserção dupla
  if(this.objects.indexOf(obj) === -1)
  {

    var i = 0,
        index;

    //se tivermos subnós...
    if( typeof this.nodes[0] !== 'undefined' ) {
      index = this.getIndex( obj );

      if( index !== -1 ) {
        this.nodes[index].insert( obj );
        return;
      }
    }

    this.objects.push( obj );

    if( this.objects.length > this.max_objects && this.level < this.max_levels ) {

      //dividir se ainda não tivermos subnós
      if( typeof this.nodes[0] === 'undefined' ) {
        this.split();
      }

      //adicione todos os objetos aos seus subnós correspondentes
      while( i < this.objects.length ) {

        index = this.getIndex( this.objects[i] );

        if( index !== -1 ) {
          this.nodes[index].insert( this.objects.splice(i, 1)[0] );
        } else {
          i = i + 1;
        }
      }
    }
  }
};


/*
	 * Retorne todos os objetos que podem colidir com uma determinada área
	 */
Quadtree.prototype.retrieve = function( pRect ) {


  var index = this.getIndex( pRect ),
      returnObjects = this.objects;

  //se tivermos subnós...
  if( typeof this.nodes[0] !== 'undefined' ) {

    //se pRect se encaixa em um subnó...
    if( index !== -1 ) {
      returnObjects = returnObjects.concat( this.nodes[index].retrieve( pRect ) );

      //se pRect não se encaixa em um subnó, compare-o com todos os subnós
    } else {
      for( var i=0; i < this.nodes.length; i=i+1 ) {
        returnObjects = returnObjects.concat( this.nodes[i].retrieve( pRect ) );
      }
    }
  }

  return returnObjects;
};

Quadtree.prototype.retrieveFromGroup = function( pRect, group ) {

  var results = [];
  var candidates = this.retrieve(pRect);

  for(var i=0; i<candidates.length; i++)
    if(group.contains(candidates[i]))
    results.push(candidates[i]);

  return results;
};

/*
	 * Coloque todos os objetos armazenados no quadtree
	 */
Quadtree.prototype.getAll = function() {

  var objects = this.objects;

  for( var i=0; i < this.nodes.length; i=i+1 ) {
    objects = objects.concat( this.nodes[i].getAll() );
  }

  return objects;
};


/*
	 * Obtenha o nó no qual um determinado objeto está armazenado
	 */
Quadtree.prototype.getObjectNode = function( obj ) {

  var index;

  //se não houver subnós, o objeto deve estar aqui
  if( !this.nodes.length ) {

    return this;

  } else {

    index = this.getIndex( obj );

    //se o objeto não se encaixa em um subnó, ele deve estar aqui
    if( index === -1 ) {

      return this;

      //se ele se encaixa em um subnó, continue uma pesquisa mais profunda lá
    } else {
      var node = this.nodes[index].getObjectNode( obj );
      if( node ) return node;
    }
  }

  return false;
};


/*
	 * Remove um objeto específico do quadtree
   * Não exclui subnós vazios. Veja a função de limpeza
	 */
Quadtree.prototype.removeObject = function( obj ) {

  var node = this.getObjectNode( obj ),
      index = node.objects.indexOf( obj );

  if( index === -1 ) return false;

  node.objects.splice( index, 1);
};


/*
	 * Limpa o quadtree e exclua todos os objetos
	 */
Quadtree.prototype.clear = function() {

  this.objects = [];

  if( !this.nodes.length ) return;

  for( var i=0; i < this.nodes.length; i=i+1 ) {

    this.nodes[i].clear();
  }

  this.nodes = [];
};


/*
	 * Limpa o quadtree
	 * Como apagar, mas os objetos não serão excluídos, mas reinseridos
	 */
Quadtree.prototype.cleanup = function() {

  var objects = this.getAll();

  this.clear();

  for( var i=0; i < objects.length; i++ ) {
    this.insert( objects[i] );
  }
};



function updateTree() {
  if(this.quadTree.active)
  {
    this.quadTree.updateBounds();
    this.quadTree.cleanup();
  }
}

//entrada de teclado
p5.prototype.registerMethod('pre', p5.prototype.readPresses);

//atualização automática de sprite
p5.prototype.registerMethod('pre', p5.prototype.updateSprites);

//atualização de quadtree
p5.prototype.registerMethod('post', updateTree);

//empurrar e estourar a câmera
p5.prototype.registerMethod('pre', cameraPush);
p5.prototype.registerMethod('post', cameraPop);

//deltaTime
//p5.prototype.registerMethod('pre', updateDelta);

/**
 *  Registre uma mensagem de aviso na tela do host, usando `console.warn` nativo
 * caso esteja disponível, mas recorrer ao `console.log` se não estiver. Se a tela
 * não estiver disponível, este método falhará silenciosamente.
 * @method _warn
 * @param {!string} message
 * @private
 */
p5.prototype._warn = function(message) {
  var console = window.console;

  if(console)
  {
    if('function' === typeof console.warn)
    {
      console.warn(message);
    }
    else if('function' === typeof console.log)
    {
      console.log('Warning: ' + message);
    }
  }
};

}));
