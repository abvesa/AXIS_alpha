//////////////////////////////////////////////////////////////////////////////////

// global variable

const express = require('express')
const fs = require('fs')
const http = require('http')
const MongoClient = require('mongodb').MongoClient
const path = require('path')
const socket = require('socket.io')

const apps = express()
const server = http.createServer(apps)
const io = socket(server)
apps.use(express.static(path.join(__dirname, 'app')))

const opt = {
  mongo: (fs.existsSync('db.json'))? JSON.parse(fs.readFileSync('db.json', 'utf-8')).mongo : null,
  serv_port: 1350
}
//opt.url = `mongodb://${opt.mongo.account}:${opt.mongo.passwd}@localhost/${opt.mongo.dbname}`
opt.url = `mongodb://${process.env.acc || opt.mongo.account}:${process.env.pwd || opt.mongo.passwd}@${process.env.srv || opt.mongo.server}/${process.env.dbn || opt.mongo.dbname}`

const app = {
  db: null,
  file: {
    preload: JSON.parse(fs.readFileSync('preload.json', 'utf-8')),
	backup_cardlist: JSON.parse(fs.readFileSync('card.json', 'utf-8')),
	backup_statlist: JSON.parse(fs.readFileSync('stat.json', 'utf-8'))
  }
}

const effect = require('./effect.js')

//////////////////////////////////////////////////////////////////////////////////

// classes

const Card = function (init) {
  //-! this = JSON.parse(JSON.stringify(init))
  this.id = null
  this.name = init.name
  this.type = init.type
  this.energy = (this.type.base === 'artifact')? 2: 1
  this.bond = null
  if (this.type.base === 'artifact') {
    this.overheat = false
    this.socket = {}
  }
  if (this.type.base === 'spell' && this.type.effect.trigger) {
    this.lock = true
  }
  
  let rlt = this.checkMultiType()
  if (Object.keys(rlt).length) {
    this.curr_eff = null
    this.eff_choice = rlt
  }
  
  if (this.type.base !== 'vanish') { 
	this.counter = {}
	if ('counter' in game.default.all_card[this.name]) {
	  for (let type in game.default.all_card[this.name].counter) {
		this.counter[type] = true  
	  }  	
	}
    if (!Object.keys(this.counter).length) 
	  delete this.counter
  }

  this.field = init.field
  this.cover = true
  this.owner = init.owner
  this.curr_own = init.owner
  this.room = null
}

Card.prototype.checkMultiType = function () {
  let eff_tp = Object.keys(this.type.effect)
  if (eff_tp.length == 1 && this.type.effect[eff_tp[0]] == 1) return {}
  if (eff_tp.length == 2 && this.type.effect.counter) return {}
  if (this.name === 'vanish') return {}

  if (eff_tp.length == 1) eff_tp = [`${eff_tp[0]}_1`, `${eff_tp[0]}_2`]
  console.log(game.default.all_card[this.name])
  let eff_str = game.default.all_card[this.name].text.split('\n')
  let rlt = {}
  for (let i of [0, 1]) rlt[eff_tp[i]] = eff_str[2*i+1] + '\n' + eff_str[2*i+2]
  return rlt
}

Card.prototype.checkCrossProtection = function () {
  let room = game.room[this.room]
  if ('socket' in this) {
	for (let item_id in this.socket) {
	  if (item_id in room.player[this.curr_own].anti.cross) {
		game.emitCounter(room.player[this.curr_own], type = 'cross', spec_id = item_id)
		return true
	  }
	}
  }
  return false  
}

const Game = function () {
  this.default = {
    all_card    : {},
    all_stat    : {},
    // card type
    artifact_max: 6,//5,//13,
    spell_max   : 7,//3,//14,
    item_max    : 5,//2,//12,
    vanish_max  : 4,//11
    // player attribute
    atk_damage  : 1,
    atk_phase   : 1,
    action_point: 100,//1,//
    deck_max    : 22,//14, // 50
    hand_max    : 7,
    life_max    : 6
  }
  this.phase_rule = {
    // normal action
    draw   : {},
    use    : {
      choose: {attack: true, effect: true}, // hand
      normal: {normal: true, choose: true}
    },
    trigger: {attack: true, effect: true}, // battle, altar
    // specific action
    life   : {attack: true, effect: true}, // life
    grave  : {effect: true},
    deck   : {effect: true}
  }
  this.choose_eff = {
    bleed   : true,
    block   : true, // card you use to block
    break   : true,
    control : true,
    drain   : true,
    discard : true,
    damage  : true,
	exchange: true,
    recall  : true,
    heal    : true,
    receive : true, // card you flip for life loss
    retrieve: true,
	reuse   : true,
    steal   : true,
    teleport: true,
	discardOrDrain: true
  }

  this.pool = {}
  this.queue = []
  this.room = {}
}

/////////////////////////////////////////////////////////////////////////////////
// !-- build objects
Game.prototype.buildPlayer = function (client) {
  // basic
  client.hp = this.default.life_max
  client.atk_damage = game.default.atk_damage
  client.atk_phase = game.default.atk_phase
  client.action_point = game.default.action_point
  client.deck_max = game.default.deck_max
  client.hand_max = game.default.hand_max
  client.life_max = game.default.life_max
  client.card_amount = {altar: 0, battle: 0, deck: 0, grave: 0, hand: 0, life: 0, socket: 0}
  client.field_detail = {
	battle: {artifact: 0},
	altar: {spell: 0},
	socket: {item: 0},
	deck: {item: 0, artifact: 0, spell: 0, vanish: 0}, 
	hand: {item: 0, artifact: 0, spell: 0, vanish: 0},  
	grave: {item: 0, artifact: 0, spell: 0, vanish: 0}, 
    life: {item: 0, artifact: 0, spell: 0, vanish: 0}
  }
  client.choose_deck = {}

  // action
  client.interrupt = false

  // effect
  client.atk_enchant = {}
  client.aura = { // permenent till be counter or remove
    decay  : {}, // turn down cards in this list when use vanish
    cripple: {}, // can't draw card
    disease: {}, // can't heal
    wither : {}, // can't use life field card
    fear   : {}, // can't attack
	unveil : {}, // show your hand cards to opponent
    guilt  : {}, // every time you attack must discard 1 card or drain your artifact once, stackable
	strength: {}, // your attack damage +1, stackable
	
    fortify : {}, // your artifacts can't be destroy or break or turn 
    triumph : {}, // atk cant be vanish when artifact > 3 on battle
    precise : {}, // atk cant be vanish
    stamina : {}, // handcard limit + 2, stackable
    recycle : {}, // draw 1 card when an artifact send to grave, stackable
    berserk : {}  // equip wont cost action point
  }
  client.buff = { // next action trigger
    mana_tide : false, // next spell this turn won't cost action point
    quick_draw: false, // next equip this turn won't cost action point
    eagle_eye : false // next attack you perform can't be vanish
  }
  client.stat = {
    charge : false, // add one additional turn
    stun   : false, // can only use item
    petrify: false, // can only draw card
	warcry : false, // can only attack
    freeze : false  // can't attack and use item
  }
  client.special = {
	poopoo     : {},  // foe can't attack and discard when attack
	avenger	   : {}, // negate card effect
	meteor	   : {},   // all your cards can become vanish
    laevantine : {}
  }
  client.anti = { 
	card: {},
	spell: {},
	item: {},
	vanish: {},
	artifact: {},
	effect: {},
	damage: {},
	attack: {},
    
    // special
    cross: {}
  }

  client.eff_todo = {} // current effect emit to client  
  client.dmg_blk = [] // effect damage only
  client.chanting = {}

  // choose
  client.card_pause = {} // card needs another card to effect

  // vanish
  client.first_conceal = false

  // decks
  client.deck_slot = {}
  client.curr_deck = []
}

/////////////////////////////////////////////////////////////////////////////////
// !-- card adjusting

/*
param = {
  personal: {
    id:
  }
}

rlt = {
  id: {

  },
}
*/
// personal >> who own this card currently
Game.prototype.cardMove = function (personal, rlt) {
  let player = {personal: personal, opponent: personal._foe}
  let param = {personal: {}, opponent: {}}
  let aura_modify = {personal: {}, opponent: {}}
  let room = game.room[personal._rid]

  for (let id in rlt) {
    let card = room.cards[id]
    let origin_owner = (card.owner === personal._pid)? 'personal' : 'opponent'
	
    // owner and attribute adjust, rlt[id].new_own set here when the card will be into grave
    rlt[id].curr_own = (card.curr_own === personal._pid)? 'personal' : 'opponent'
    rlt[id].name = (rlt[id].cover)? 'cardback' : card.name
    
	if (!('to' in rlt[id])) rlt[id].to = 'grave'
	
	if (!('new_own' in rlt[id])) {
	  if ((rlt[id].to === 'grave' || rlt[id].to === 'hand') && (rlt[id].from !== 'deck' && rlt[id].from !== 'life' && rlt[id].from !== 'grave')) {
		rlt[id].new_own = origin_owner  
	  }
	  else {
		rlt[id].new_own = rlt[id].curr_own
	  }
	}
    
    if (((rlt[id].to === 'grave' || rlt[id].to === 'hand') && (card.field === 'battle' || card.field === 'altar')) || ((rlt[id].to === 'deck' || rlt[id].to === 'life') && card.field !== 'hand') ) {
      // reseting card when card leave field
	  if (game.default.all_card[card.name].aura) {
		aura_modify[rlt[id].curr_own][id] = false
	  }
	  if ('counter' in card) {
		for (let counter_type in card.counter) {
		  if (card.id in player[rlt[id].curr_own].anti[counter_type])
		    delete player[rlt[id].curr_own].anti[counter_type][card.id]
	    }
	  } 	  
	  if (card.type.base === 'artifact') {
        card.overheat = false
        card.energy = 2
      }
      else {
        if ('lock' in card) card.lock = true
        card.energy = 1
      }
    }
    else {
	  // card owner change when card on battle or altar
      if ((card.field === rlt[id].to && card.curr_own !== player[rlt[id].new_own]._pid && (card.field === 'battle' || card.field === 'altar')) || (rlt[id].from === 'grave' && rlt[id].to === 'battle')) {
        if ('aura' in game.default.all_card[card.name]) {
		  aura_modify[rlt[id].curr_own][id] = false
		  aura_modify[rlt[id].new_own][id] = true
        }
		if ('counter' in card) {
		  for (let counter_type in card.counter) {
		    if (card.id in player[rlt[id].curr_own].anti[counter_type]) delete player[rlt[id].curr_own].anti[counter_type][card.id]
			player[rlt[id].new_own].anti[counter_type][card.id] = true
	      }
		}
      }
    }
		
    if (card.socket && Object.keys(card.socket).length) {
	  let tmp = game.cardMove(player[rlt[id].curr_own], Object.assign({}, card.socket))
	  if (rlt[id].curr_own === 'personal') {
        Object.assign(param.personal, tmp.personal)
        Object.assign(param.opponent, tmp.opponent)
      }
	  else {
        Object.assign(param.personal, tmp.opponent)
        Object.assign(param.opponent, tmp.personal)  
	  }
	}

    if (rlt[id].on) {
	  room.cards[rlt[id].on].socket[id] = {off: rlt[id].on}
      card.bond = rlt[id].on
    }
    if (rlt[id].off) {
	  delete room.cards[rlt[id].off].socket[id]
      card.bond = null
    }

    // move card
    let pre_deck_empty = (player[rlt[id].curr_own].card_amount.deck == 0)? true : false
	rlt[id].from = card.field
    player[rlt[id].curr_own].card_amount[rlt[id].from] -= 1
	player[rlt[id].curr_own].field_detail[rlt[id].from][card.type.base] -= 1
	let post_deck_empty = (player[rlt[id].curr_own].card_amount.deck == 0)? true : false
    if (!pre_deck_empty && post_deck_empty) rlt[id].deck_empty = rlt[id].curr_own
	 
	card.field = rlt[id].to
	if (rlt[id].to === 'deck') {
		let tmp_card = card
		delete room.cards[id]
		room.cards[id] = tmp_card
	}	
	
	pre_deck_empty = (player[rlt[id].curr_own].card_amount.deck == 0)? true : false
    player[rlt[id].new_own].card_amount[rlt[id].to] += 1
	player[rlt[id].new_own].field_detail[rlt[id].to][card.type.base] += 1
    card.curr_own = player[rlt[id].new_own]._pid
    post_deck_empty = (player[rlt[id].curr_own].card_amount.deck == 0)? true : false
    if (pre_deck_empty && !post_deck_empty) rlt[id].deck_refill = rlt[id].curr_own

	if ((rlt[id].to === 'hand' || rlt[id].to === 'grave') || (rlt[id].to === 'life' && rlt[id].from === 'deck')) {
	  card.cover = true
	}
	else if ((rlt[id].from === 'hand' || rlt[id].from === 'deck' || rlt[id].from === 'grave') && (rlt[id].to === 'life' || rlt[id].to === 'battle' || rlt[id].to === 'altar' || rlt[id].to === 'socket')) {
	  card.cover = false	
	}
	
	if (rlt[id].to === 'deck' || rlt[id].from === 'deck' || rlt[id].to === 'hand' || rlt[id].from === 'hand') {
	  personal.emit('attrAdjust', {attr: {
		personal: {hand: `${personal.card_amount.hand}/${personal.hand_max + Object.keys(personal.aura.stamina).length*2}`, deck: personal.card_amount.deck}, 
		opponent: {hand: `${personal._foe.card_amount.hand}/${personal._foe.hand_max + Object.keys(personal._foe.aura.stamina).length}`, deck: personal._foe.card_amount.deck}
	  }})
	  
	  personal._foe.emit('attrAdjust', {attr: {
		opponent: {hand: `${personal.card_amount.hand}/${personal.hand_max + Object.keys(personal.aura.stamina).length*2}`, deck: personal.card_amount.deck}, 
		personal: {hand: `${personal._foe.card_amount.hand}/${personal._foe.hand_max + Object.keys(personal._foe.aura.stamina).length}`, deck: personal._foe.card_amount.deck}
	  }})
	}
	
    // build return object
    param.personal[id] = {}
	if (rlt[id].to === 'hand' && rlt[id].new_own === 'opponent' && !Object.keys(player[rlt[id].new_own].aura.unveil).length) {
	  //console.log('aaa')
	  rlt[id].cover = true
	  if (rlt[id].from === 'deck') delete rlt[id].name
    } 
	else if (rlt[id].to === 'life' && rlt[id].from === 'deck') {
	  rlt[id].cover = true
	  if (rlt[id].new_own === 'opponent') delete rlt[id].name
	}
	else rlt[id].cover = false
    Object.assign(param.personal[id], rlt[id])
	
    param.opponent[id] = {}
    rlt[id].curr_own = (rlt[id].curr_own === 'personal')? 'opponent' : 'personal'
    rlt[id].new_own = (rlt[id].new_own === 'personal')? 'opponent' : 'personal'
    if (rlt[id].deck_empty) rlt[id].deck_empty = (rlt[id].deck_empty === 'personal')? 'opponent' : 'personal'

    //rlt[id].cover = (rlt[id].off)? true : false

    if (rlt[id].to === 'hand' && rlt[id].new_own === 'opponent' && !Object.keys(player[(rlt[id].new_own === 'opponent')? 'personal' : 'opponent'].aura.unveil).length) {
      //console.log('bbb')
	  rlt[id].cover = true
	  if (rlt[id].from === 'deck') delete rlt[id].name
    } 
	else if (rlt[id].to === 'life' && rlt[id].from === 'deck') {
	  rlt[id].cover = true
	  if (rlt[id].new_own === 'opponent') delete rlt[id].name
	}
	else rlt[id].cover = false
    Object.assign(param.opponent[id], rlt[id])
  }

  if (Object.keys(aura_modify.personal).length) game.aura(personal, aura_modify.personal)
  if (Object.keys(aura_modify.opponent).length) game.aura(personal._foe, aura_modify.opponent)
  
  return param
}

/////////////////////////////////////////////////////////////////////////////////
// !-- changing phase
Game.prototype.attackEnd = function (room) {
  room.phase = 'normal'
  room.atk_status.hit = false

  room.atk_status.attacker.atk_damage = this.default.atk_damage
  room.atk_status.attacker.atk_enchant = {}
  room.atk_status.attacker = null
  room.atk_status.defender = null
  for (let pid in room.player) {
    let rlt = (pid == room.curr_ply) ? 'your turn' : 'opponent turn'
    room.player[pid].emit('phaseShift', {msg: {phase: 'normal phase', action: rlt}})
  }
}

Game.prototype.effectEnd = function (room) {
  if (room.phase === 'attack') {
	if (!room.atk_status.in_progress) {
	  if (room.atk_status.hit) {
	    if (this.checkCounter(room.atk_status.defender, 'damage')) {	
		  room.phase = 'counter_attack'
		  this.emitCounter(room.atk_status.defender, 'damage')
		  this.attackEnd(room)
	    }
	    else {
		  if (room.atk_status.attacker.atk_damage > 0) { 		  
		    room.atk_status.defender.eff_todo.attack = {attack: {damage: true}}
		    room.atk_status.defender.emit('effectLoop', {rlt: {name: 'attack', id: 'attack', eff: 'damage', tp: 'attack'}})
		  }
		  else this.attackEnd(room)
	    }
	  }
	  else this.attackEnd(room)
    }
  }
  else {
    room.phase = 'normal'
    if (room.player[room.curr_ply].interrupt) {
      // end turn immediately
      game.frontEnd(room.player[room.curr_ply])
    }
    else {
      for (let pid in room.player) {
        let rlt = (pid == room.curr_ply) ? 'your turn' : 'opponent turn'
        room.player[pid].emit('phaseShift', {msg: {phase: 'normal phase', action: rlt}})
      }
    }
  }
}

//////////////////////////////////////////////////////////////////////////////////
// !-- action

Game.prototype.emitCounter = function (personal, type = null, spec_id = null) {
  // personal = who own counter card
  let room = this.room[personal._rid]
  let cnt_type = (type == null)? room.counter_status.type : type
  let anti_queue = Object.keys(personal.anti[cnt_type])
  let card_id = (spec_id == null)? anti_queue[0] : spec_id
  let card = room.cards[card_id]
  if ('counter' in card && card.type.base === 'artifact') {
    card.energy -= 1
	card.overheat = true
	personal.emit('playerCounter', { msg: {phase: 'normal phase', action: 'counter success... waiting opponent', cursor: ' '}, turn_dn: {id: card_id, from: card.field, curr_own: 'personal'} })
    personal._foe.emit('playerCounter', { msg: {phase: 'normal phase', action: 'be countered... your turn', cursor: ' '}, turn_dn: {id: card_id, from: card.field, curr_own: 'opponent'} })
  }
  else {
	let param = {[card_id]: {from: card.field}}
	if (card.type.effect.mosaic) param[card_id].off = card.bond  
	let rlt = this.cardMove(personal, param)
	personal.emit('playerCounter', { msg: {phase: 'normal phase', action: 'counter success... waiting opponent', cursor: ' '}, card: rlt.personal })
    personal._foe.emit('playerCounter', { msg: {phase: 'normal phase', action: 'be countered... your turn', cursor: ' '}, card: rlt.opponent })
    //personal.anti[cnt_type].shift()
    delete personal.anti[cnt_type][card_id]
  }
    
  this.buildEffectQueue( personal, {counter: {[card_id]: true}} )
}

Game.prototype.checkCounter = function (personal, type) {
  // personal = who own counter card
  
  let anti_queue = Object.keys(personal.anti[type])
  
  if (anti_queue.length) {
	let room = this.room[personal._rid]
	let card = room.cards[anti_queue[0]]
	if (type === 'artifact' && Object.keys(personal._foe.aura.fortify).length) return false
	
	if (card.type.base === 'artifact') {
	  if (card.overheat == true || card.energy < 1) return false  
	}
	return true
  }
  else {
	if (type !== 'damage' && type !== 'effect' && type !== 'attack' && type !== 'vanish') {
	  let anti_card = Object.keys(personal.anti.card)
	  if (anti_card.length) {
		if (type === 'artifact' && Object.keys(personal._foe.aura.fortify).length) return false	  
		personal.anti[type][anti_card[0]] = true  
		delete personal.anti.card[anti_card[0]]
	    return true
	  }
	  else 
		return false
	}
	else 
	  return false	
  }
}

Game.prototype.checkUse = function (client, it, cb) {
  // pre-checking ...
  let room = game.room[client._rid]
  let card = room.cards[it.id]

  if (!('choose' in client.card_pause)) {
    if (room.phase === 'effect' || room.phase === 'attack' || room.phase === 'end') return cb( { err: 'choose'} )
	if (client.stat.warcry) return cb({err: 'cant use card when warcry'})
    if (card.field === 'socket' && room.phase === 'counter') return cb( {err: 'choose'} )

    if (room.curr_ply !== client._pid) return cb( {err: 'waiting for opponent' } )
    if (card.curr_own !== client._pid) return cb( {err: 'cant use opponent card'})
    if (card.cover && card.field === 'life') return cb({err: 'cant use covered card'})
    if (card.field === 'socket' && room.phase === 'normal') {
      client.card_pause.return = it.id
      return game.useCard(client)
    }
    if (!game.phase_rule.use.normal[room.phase]) return cb( { err: `not allowed in ${room.phase} phase`} )

    if (!Object.keys(client.card_pause).length) {
      if (room.cards[it.id].type.base === 'vanish') return cb( {err: 'only available in atk phase'} )
      if ((client.stat.stun || client.action_point <= 0) && room.cards[it.id].type.base !== 'item') return cb( {err: 'not enough action point'} )
      if (card.field === 'life' && client.card_amount.hand == 0) return cb( {err: 'no handcard to replace'} )
      if (card.field === 'life' && Object.keys(client.aura.wither).length) return cb({err: 'cant use life field cards when withered'})
    }
    else
      if(card.field === 'life') return cb( {err: 'its not a handcard'} )
  }
  if (client.stat.warcry) return cb({err: 'cant use card when warcry'})
  // choose one check ... if true return else continue
  if (game.chooseOne(client, it, cb)) return

  switch(card.field){
    case 'hand':
      let tg = (client.card_pause.use)? room.cards[client.card_pause.use] : (card)
      let tp = (client.card_pause.use)? 'swap' : 'use'
      if (tp === 'use' && tg.type.effect.mosaic && !client.card_amount.battle) return cb({err: 'no artifact to place on'})

      client.card_pause[tp] = it.id
      if (tg.type.effect.mosaic) {
        room.phase = 'socket'
        return cb({err: 'choose artifact to place on'})
      }
      else {
        //room.phase = 'normal'
        game.useCard(client)
      }
      break

    case 'life':
      if (room.cards[it.id].type.effect.mosaic && !client.card_amount.battle) return cb({err: 'no artifact to place on'})

      room.phase = 'choose'
      client.card_pause.use = it.id
      cb({err: 'choose handcard to replace'})
      break

    default: break
  }
}

Game.prototype.useCard = function (client) {
  let room = game.room[client._rid]

  let rtn_id = client.card_pause.return
  let use_id = (rtn_id != null)? rtn_id : (client.card_pause.use)
  let swp_id = client.card_pause.swap
  let skt_id = client.card_pause.socket

  client.card_pause = {}
  room.counter_status.use_id[use_id] = true

  let param = {}
  param[use_id] = {}
  switch (room.cards[use_id].type.base) {
    case 'artifact':
      if (Object.keys(client.aura.berserk).length || client.buff.quick_draw) game.buff(client, {quick_draw: {personal: false}})
      else client.action_point -= 1  
      param[use_id].to = 'battle'
      param[use_id].action = 'equip'
      break

    case 'item'		 :
      let to = (skt_id != null)? 'socket' : ((rtn_id != null)? 'hand' : 'grave')
      let act = (skt_id != null)? 'socket' : ((rtn_id != null)? 'return' : 'use')
      param[use_id].to = to
      param[use_id].action = act
      if (skt_id != null) param[use_id].on = skt_id
      if (rtn_id != null) param[use_id].off = room.cards[use_id].bond
      break

    case 'spell'   :
      if (client.buff.mana_tide) game.buff(client, {mana_tide: {personal: false}})
      else client.action_point -= 1
      param[use_id].action = 'cast'
      if (room.cards[use_id].type.effect.instant) param[use_id].to = 'grave'
      else param[use_id].to = 'altar'
      break

    default        : break
  }
  if (this.checkCounter(client._foe, room.cards[use_id].type.base)) {
	param[use_id].to = 'grave'
	if ('on' in param[use_id]) delete param[use_id].on
	if ('off' in param[use_id]) delete param[use_id].off
	room.counter_status.success = true
  }
  if (swp_id != null) {
    param[swp_id] = {to: 'life'}
  }

  let rlt = game.cardMove(client, param)
  let msg = `${param[use_id].action} ${room.cards[use_id].name}${(swp_id != null)? ` by ${room.cards[swp_id].name}` : ''}`

  client.emit('plyUseCard', { msg: {phase: 'counter phase', action: msg}, card: rlt.personal, attr: {personal: {action_point: client.action_point}}})
  client._foe.emit('plyUseCard', { msg: {phase: 'counter phase', action: `foe ${msg}`}, card: rlt.opponent, attr: {opponent: {action_point: client.action_point}}, foe: true })

  room.phase = 'counter'
  room.counter_status.type = room.cards[use_id].type.base
  room.counter_status.start = 'use'
  room.counter_status.last_ply = client
}

Game.prototype.triggerCard = function (client, it, cb) {
  // pre-checking ...
  let room = game.room[client._rid]
  let card = room.cards[it.id]

  if (room.phase === 'counter' || room.phase === 'effect' || room.phase === 'attack') return cb({err: 'choose'})
  if (client.stat.warcry) return cb({err: 'cant trigger card when warcry'})
  if (room.curr_ply !== client._pid) return cb({err: 'waiting for opponent'})
  if (card.curr_own !== client._pid) return cb( {err: 'cant trigger opponent card'})
  if (room.phase === 'socket') {
    if (card.type.base !== 'artifact') return cb({err: 'can only socket on artifact'})
    client.card_pause['socket'] = it.id
    return game.useCard(client)
  }
  if (room.phase !== 'normal') return cb({err: `not allowed in ${room.phase} phase`})
  if ('counter' in card && Object.keys(card.type.effect).length == 1) return cb({err: 'only available in counter phase'})
  if (card.type.base === 'artifact' && 'aura' in card.type.effect) return cb({err: 'no trigger effect'})
  if (card.type.base === 'spell' && !('trigger' in card.type.effect)) return cb({err: 'no trigger effect'})

  // choose one check ... if true return else continue
  if (game.chooseOne(client, it, cb)) return

  if (card.type.base === 'artifact') {
    if (card.overheat) return cb({err: 'artifact overheat'})
    if (card.energy == 0) return cb({err: 'energy lacking'})
    card.overheat = true
    card.energy -= 1

    if (card.energy == 0 && game.default.all_card[card.name].aura) {
      param = {}
      param[it.id] = false
      game.aura(client, param)
    }
    
    room.phase = 'counter'
    room.counter_status = {start: 'trigger', type: 'effect', use_id: {}, counter_id: {}, success: this.checkCounter(client._foe, 'effect')}
    room.counter_status.use_id[it.id] = true
    client.emit('playerTrigger', { msg: {phase: 'counter phase', action: `trigger ${card.name}`}, card: {id: it.id, curr_own: 'personal', from: 'battle'}, rlt: {} })
    client._foe.emit('playerTrigger', { msg: {phase: 'counter phase', action: `foe trigger ${card.name}`}, card: {id: it.id, curr_own: 'opponent', from: 'battle'}, rlt: {opponent: true, counter: true}, foe: true })
  }
  else {
    if (card.type.base === 'item' || (card.type.base === 'spell' && card.type.effect.trigger)) {
      if (card.type.base === 'spell' && card.lock) return cb({err: 'trigger spell takes one turn to unseal'})

      room.phase = 'effect'
      // send to grave
      let param = {}
      param[it.id] = {to: 'grave'}
      let rlt = game.cardMove(client, param)
      client.emit('playerTrigger', { msg: {phase: 'effect phase', action: `trigger ${card.name}`}, card: rlt.personal })
      client._foe.emit('playerTrigger', { msg: {phase: 'effect phase', action: `foe trigger ${card.name}`}, card: rlt.opponent, foe: true })

      // effect trigger
      param = {trigger: {}}
      param.trigger[it.id] = {}
	  game.buildEffectQueue(client, param)
    }
  }
}

Game.prototype.chooseOne = function (client, it, cb) {
  let room = game.room[client._rid]
  let card = room.cards[it.id]

  if (!('choose' in client.card_pause)) {
    if (card.eff_choice && !('use' in client.card_pause)) {
      room.phase = 'choose'
      let param = {msg: {phase: 'choose', cursor: `choose an effect to trigger`}, cid: it.id, rlt: card.eff_choice}
      client.emit('chooseOne', param)
      client._foe.emit('chooseOne', {msg: {phase: 'choose', cursor: 'opponent choosing effect'}})
      client.card_pause.choose = it.id
      return true
    }
    else return false
  }
  else {
    if (client.card_pause.choose !== it.id) return
    if (!game.default.all_card[card.name].effect[it.eff]) return
    card.curr_eff = it.eff
    delete client.card_pause.choose
    cb({cursor: `${(card.field === 'life')? 'choose a handcard to replace' : ''}`})
    return false
  }
}

//// new effect

Game.prototype.buildEffectQueue = function (personal, card_list) {
  let room = this.room[personal._rid]
  let effect_queue = []
  for (let tp in card_list) {
    for (let id in card_list[tp]) {
      let card = room.cards[id]
      let tg_tp = (card.curr_eff)? card.curr_eff : (tp)
      let judge = this.default.all_card[card.name].eff_judge[tg_tp]

	  let card_eff = {tp: tg_tp, id: id, name: card.name, eff: [], initiator: personal}
      for (let effect in judge) 
	    card_eff.eff.push(effect)
    
	  if (card_eff.eff.length) effect_queue.push(card_eff)
	}
  }
  
  if (effect_queue.length) {
	//room.effect_queue = effect_queue
	Array.prototype.push.apply(room.effect_queue, effect_queue)
    this.effectEmitter(room)
  }
  //if (room.effect_queue.length) this.effectEmitter(room)
  else {
	this.checkEffectDone(personal)
  }
}

Game.prototype.AIReaction = function () {
	
}

Game.prototype.requestDischarger = function (action, param) {
  /*
    action = {
	  type
	  player 
	} 
	
	different params each type needs
	param = { 
	  >> type == effect
	  1. name
	  2. effect   
	  3. info (if needed)
	  
	  >> 
	}
  */
  let rtn = {pass: true}
  
  switch (action.type) {
    case 'effect': 
	  let rlt = ('info' in action)? this[param.name](action.player, param.effect, param.info) : this[param.name](action.player, param.effect)
	  if ('err' in rlt) rtn = rlt
	  else {
		if ('eff' in rlt) {
		  if (!('__imabot__' in action.player)) action.player.emit('effectTrigger', rlt.eff.personal)		  
		  if (!('__imabot__' in action.player._foe)) action.player._foe.emit('effectTrigger', rlt.eff.opponent)
	    }
	  }
      break
    
	case '':
	  break
	
	default:
	  break
  }
  
  return rtn
}

// effectEmitter emits one effect at a time, stops at one card's effects
Game.prototype.effectEmitter = function (room) {
  let card_eff = this.effectJudge(room.effect_queue.shift())
  //console.log(card_eff)
  let personal = card_eff.initiator
  let opponent = personal._foe
  let player = {personal: personal, opponent: opponent}

  // effect phase of attack enchant will count as attack phase
  if (room.phase !== 'attack') room.phase = 'effect'
  personal.emit('phaseShift', {msg: {phase: `${room.phase} phase`}})
  opponent.emit('phaseShift', {msg: {phase: `${room.phase} phase`}})
  
  for (let avail_eff of card_eff.eff) {
	let eff_name = avail_eff.split('_')[0]	
	let eff_core = Object.assign({}, this.default.all_card[card_eff.name].effect[card_eff.tp][avail_eff])

    if (!(eff_name in this.choose_eff)) {
	  // !-- ai bot			
	  /*
	  let rlt = this[eff_name](personal, eff_core, card_eff)	
	  if ('eff' in rlt) {
	    personal.emit('effectTrigger', rlt.eff.personal)
        personal._foe.emit('effectTrigger', rlt.eff.opponent)
	  }
	  */
	  
	  this.requestDischarger({player: personal, type: 'effect'}, {name: eff_name, effect: eff_core, info: card_eff})	  
	}
	else {
	  for (let target in eff_core) {
        let tmp = {id: card_eff.id, name: card_eff.name, eff: avail_eff, tp: card_eff.tp, tg: target, ext: {}}

        if (eff_name === 'damage') {
		  if (this.checkCounter(player[target], 'damage')) {
		    if (room.phase !== 'attack') room.phase = 'counter_effect'
			this.emitCounter(player[target], 'damage')
			continue
		  }
          else {
			player[target].dmg_blk.push(eff_core[target].card)
          }
		}
        else if (eff_name === 'heal') {        
		  if (player[target].hp == player[target].life_max) continue 
		}
        else if ((eff_name === 'steal' || eff_name === 'exchange' || (eff_name === 'teleport' && eff_core[target]._from === 'hand')) && !Object.assign(opponent.aura.unveil).length) {
		  //if (!('ext' in tmp)) tmp.ext = {}
          tmp.ext.hand = Object.keys(this.room[personal._rid].cards).reduce( (last, curr) => {
            if (this.room[personal._rid].cards[curr].curr_own === opponent._pid && this.room[personal._rid].cards[curr].field === 'hand')
              last[curr] = this.room[personal._rid].cards[curr].name
            return last
          }, {})
        }
        else if (eff_name === 'retrieve') {
          //if (!('ext' in tmp)) tmp.ext = {}
          tmp.ext.deck = Object.keys(this.room[personal._rid].cards).reduce( (last, curr) => {
            if (this.room[personal._rid].cards[curr].curr_own === personal._pid && this.room[personal._rid].cards[curr].field === 'deck')
              last[curr] = this.room[personal._rid].cards[curr].name
            return last
          }, {})
        }
		else if (eff_name === 'recall' || eff_name === 'reuse') {
          //if (!('ext' in tmp)) tmp.ext = {}
          tmp.ext.deck = Object.keys(this.room[personal._rid].cards).reduce( (last, curr) => {
            if (this.room[personal._rid].cards[curr].curr_own === personal._pid && this.room[personal._rid].cards[curr].field === 'grave')
              if (eff_name !== 'reuse' || (eff_name === 'reuse' && this.room[personal._rid].cards[curr].type.base === 'spell'))
		        last[curr] = this.room[personal._rid].cards[curr].name
            return last
          }, {})
		}

        // put effect in effect todo		
        if (!(card_eff.id in player[target].eff_todo)) player[target].eff_todo[card_eff.id] = {}
        if (!(card_eff.tp in player[target].eff_todo[card_eff.id])) player[target].eff_todo[card_eff.id][card_eff.tp] = {}
        player[target].eff_todo[card_eff.id][card_eff.tp][avail_eff] = true
        
		// effect emit
	    player[target].emit('effectLoop', {rlt: tmp})
		
		console.log(player[target].eff_todo[card_eff.id])
	  }	
	}
  }
  
  this.checkEffectDone(personal)
}

Game.prototype.checkEffectDone = function (personal) {
  let room = this.room[personal._rid]
  let curr_phase = room.phase.split('_')
  //console.log(6, room.phase)
  if (!Object.keys(personal.eff_todo).length && !Object.keys(personal._foe.eff_todo).length) {
	if (room.effect_queue.length) {
      this.effectEmitter(room)
	}  
	else {
	  if (curr_phase.length != 2 || curr_phase[0] !== 'counter') {
	    this.effectEnd(room)	
	  }
	  else {
		room.phase = room.phase.split('_')[1]
	  }
	}
  }
  else {
	if (curr_phase.length == 2 && curr_phase[0] == 'counter') {
	  room.phase = curr_phase[1]  
    }
  }
}

Game.prototype.effectJudge = function (card_eff) {
  //console.log(card_eff)
  let personal = card_eff.initiator
  let opponent = personal._foe	
  
  let room = this.room[personal._rid]
  let player = {personal: personal, opponent: opponent}
  let judge = this.default.all_card[card_eff.name].eff_judge[card_eff.tp]
  
  let avail_eff = []
  
  for (let effect of card_eff.eff) {
	if(!Object.keys(judge[effect]).length) {
	  //if (effect !== 'counter') avail_eff.push(effect)
	  avail_eff.push(effect)
	}  
    else {
	  let pass = true
      let one_pass_all_pass = ('_opap' in judge[effect])? true : false
	  
	  for (let target in judge[effect]) {	
	    let judge_abort = false	  
		
        if (target === '_valve') continue	  
        for (let condition in judge[effect][target]) {
          let curr_val = null
		  let curr_round_judge = true
          switch (condition) {
            case 'hit':
			  curr_round_judge = room.atk_status.hit
		      break
			  
            case 'hp':
              curr_val = player[target].hp
			  curr_round_judge = checkValue(curr_val, judge[effect][target][condition], player[target])
              break
			
			case 'battle':
			case 'altar':
			case 'socket':
			  curr_val = player[target].card_amount[condition]
			  curr_round_judge = checkValue(curr_val, judge[effect][target][condition], player[target])
			  break
			
			case 'grave':
			case 'deck':
			case 'life':
            case 'hand':
			  for (let type in judge[effect][target][condition]) {
				curr_val = (type === 'card')? player[target].card_amount[condition] : player[target].field_detail[condition][type]
				
				if (type !== 'vanish' && type in game.default.all_card) {
				  curr_val = 0
				  for (let id in room.cards) {
					let card = room.cards[id]
					if (card.field !== condition) continue
					if (card.name === type) curr_val += 1						
				  }
				}
				
				curr_round_judge = curr_round_judge && checkValue(curr_val, judge[effect][target][condition][type], player[target]) 
			  }
              break
			  
			case 'aura':
			  curr_round_judge = checkAura(player[target].aura, judge[effect][target][condition])
			  break
			
            default:break
          }
		  
		  if (one_pass_all_pass && curr_round_judge) {
			judge_abort = true
			pass = true  
			break  
		  }
		  else {
		    pass = pass && curr_round_judge
          }
		}
		
		if (judge_abort) break
      }

      if (pass) {
		avail_eff.push(effect)	
      }
	  else if ('_valve' in judge[effect]) {
		avail_eff = []
		break
      }		
	}
  }
  card_eff.eff = avail_eff
  return card_eff
}


/////////////////////////////////////////////////////////////////////////////////
// !-- special aura
Game.prototype.checkSpecSwitch = function (personal, param) {
	let room = this.room[personal._rid]
	
	switch (param.eff_type) {
	  case 'laevantine':
	    //if 
	    //personal.special.meteor[param.card_id]
	    break
		
	  case 'meteor':
		personal.special.meteor[param.card_id] = (personal.hp <= 3)? true : false		
		break
		
	  case 'poopoo':
	    personal.special.poopoo[param.card_id] = (personal._foe.card_amount.hand <= 1)? true : false
	    break
		
	  case 'avenger':
	    break
	  
	  default:
	    break
	}
}

Game.prototype.triggerSpecEffect = function () {
	
}

// card effects 
for (let eff_type in effect) {
  Game.prototype[eff_type] = effect[eff_type]
}

/////////////////////////////////////////////////////////////////////////////////

// utility
function checkValue (curr_val, condition, target) {
  let operator = Object.keys(condition)[0]
  let compare_value = condition[operator]
  if (typeof(compare_value) === 'string') {
	let player = {personal: target, opponent: target._foe}
	let cv = compare_value.split('_')
	if (cv[1] === 'hp') compare_value = player[cv[0]][cv[1]]
	else compare_value = player[cv[0]].card_amount[cv[1]]
  }
  
  switch (operator) {
    case 'more':
      return (curr_val > compare_value)? true : false
    case 'goe':
      return (curr_val >= compare_value)? true : false
    case 'less':
      return (curr_val < compare_value)? true : false
    case 'loe':
      return (curr_val <= compare_value)? true : false
    case 'eql':
      return (curr_val == compare_value)? true : false

    default: break
  }
}

function checkAura (aura_status, condition) {
  let pass = true
  for (let type in condition) {
	let curr = (Object.keys(aura_status[type]).length)? true : false
	pass = pass && (curr == condition[type])   
  }  
  return pass
}

function idGenerate (length) {
  let id = ""
  let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  for(let i = 0; i < length; i++ )
    id += possible.charAt(Math.floor(Math.random() * possible.length))
  return id
}

function shuffle (card_list) {
  let i = 0, j = 0, temp = null
  for(i = card_list.length-1; i > 0; i -= 1){
    j = Math.floor(Math.random()*(i + 1))
    temp = card_list[i]
    card_list[i] = card_list[j]
    card_list[j] = temp
  }
  return card_list
}

function randomDeck () {
  let card = {
    artifact: [],
    spell: [],
    item: [],
    vanish: []
  }
  let deck = []

  for (let card_name in game.default.all_card) {
	if (card_name === 'blank') continue
	card[game.default.all_card[card_name].type.base].push(card_name)  
	  
	/*
    for (let type in card) {
      if (game.default.all_card[card_name].type.base === type) {
        card[type].push(card_name)
        break
      }
    }
	*/
  }

  for (let type in card) {
    if (type !== 'vanish') {
      let random = (shuffle(card[type])).slice(0, game.default[`${type}_max`])
      deck = deck.concat(random)
    }
    else
      for(let i = 0; i < game.default[`${type}_max`]; i++)
        deck.push(card.vanish[0])
  }
  
  return deck
}


/////////////////////////////////////////////////////////////////////////////////

// socket server

io.on('connection', client => {

  ///////////////////////////////////////////////////////////////////////////////
  // !-- init settings

  MongoClient.connect(opt.url, {useNewUrlParser: true}, (err, _db) => {
	
    if (err) throw err
    app.db = _db.db('axis')
	/*
    app.db.collection('card').find({}).toArray((err, cards) => {
      for (let name in cards)
        game.default.all_card[cards[name].name] = cards[name]
    })
	*/
	/*
    app.db.collection('stat').find({}).toArray((err, stat) => {
      for (let type in stat)
        game.default.all_stat[stat[type].name] = stat[type].text
    })
	*/
  })
  
  // local version of cardlist and statlist
  for (let name in app.file.backup_cardlist) {
	game.default.all_card[app.file.backup_cardlist[name].name] = app.file.backup_cardlist[name]	  
  }
  for (let name in app.file.backup_statlist) {
	game.default.all_stat[app.file.backup_statlist[name].name] = app.file.backup_statlist[name].text  
  }
  //
  
  client.on('chatMode', it => {
	if ('_foe' in client && '_rid' in client) client._foe.emit('chatMode', it)  
  })
  
  client.on('preload', (cb) => {
    cb(app.file.preload)
  })

  client.on('init', cb => {
    game.buildPlayer(client)
    console.log('player built')
    cb({eff: game.default.all_card, stat: game.default.all_stat})
  })

  ///////////////////////////////////////////////////////////////////////////////
  // !-- connection
  client.on('disconnect', () => {
    let rid = client._rid
    let pid = client._pid

    console.log(`${client._pid} disconnect`)

    // if client is in a match
    if('_rid' in client && '_foe' in client){
      client._foe.emit('interrupt', {err: 'opponent disconnect'})
      game.buildPlayer(client._foe)
      game.pool[client._foe._pid] = client._foe
      console.log(`reset player ${client._foe._pid}`)
      delete client._foe._rid
      delete game.room[rid]
    }

    // if client is still in pool
    if(game.pool[pid]) return delete game.pool[pid]

    // if client already waiting for match
    for(let i in game.queue)
      if(game.queue[i]._pid === pid) return game.queue.splice(i,1)
  })

  client.on('leaveMatch', cb => {
    let rid = client._rid
    console.log(`${client._pid} leave`)
    let room = game.room[rid]
    for (let pid in room.player) {
      let player = room.player[pid]
      if (pid !== client._pid) player.emit('interrupt', {err: 'opponent leave'})
	  delete player._foe
      game.buildPlayer(player)
      game.pool[pid] = player
      console.log(`reset player ${pid}`)
      delete player._rid
    }
    delete game.room[rid]
    return
  })

  client.on('matchEnd', cb => {
    if (client.hp == 0 || client._foe.hp == 0) {
	  //delete client._foe._foe
	  delete client._foe
      game.buildPlayer(client)
      game.pool[client._pid] = client
      delete game.room[client._rid].player[client._pid]
      if (!Object.keys(game.room[client._rid].player).length) delete game.room[client._rid]
      delete client._rid
      cb({})
    }
  })

  ///////////////////////////////////////////////////////////////////////////////
  // !-- personal interface
  client.on('login', (it, cb) => {
    if (it == null) return

    let user = app.db.collection('user')
    let pid = idGenerate(16)
    client._pid = pid
    game.pool[pid] = client

    user.find({account: it.acc}).toArray((err, rlt) => {
      if (!rlt.length) return cb({err: 'no such user exists'})
      if (rlt[0].passwd !== it.passwd) return cb({err: 'wrong password'})

      client._account = it.acc
      client.deck_slot = rlt[0].deck_slot
      //console.log(client.deck_slot)
      cb({deck_slot: client.deck_slot})
    })
  })

  // !deckmech
  client.on('randomDeck', (it, cb) => {
    if (it == null) return
    if (it.slot != 'slot_1' && it.slot != 'slot_2' && it.slot != 'slot_3') return
    if (typeof cb !== 'function') return

    console.log(`${client._account} build new deck_${it.slot}`)
    let newDeck = randomDeck()
    let user = app.db.collection('user')
    user.find({account: client._account}).toArray((err, rlt) => {
      let deck = rlt[0].deck_slot
      deck[it.slot].card_list = newDeck
      let change = {$set: {deck_slot: deck}}
      user.update({account: client._account}, change, (err, res) => {
        if(err) throw err
        cb({newDeck: newDeck})
      })
    })
  })

  client.on('searchMatch', (it, cb) => {
    let user = app.db.collection('user')
    let cards = app.db.collection('card')
    let deck = []

    if (it == null) return
    if (typeof cb !== 'function') return

    if (!it.curr_deck) return cb({err: 'please choose a deck'})
    user.find({account: client._account}).toArray((err, rlt) => {
      if (!rlt[0].deck_slot[it.curr_deck] && it.curr_deck !== 'random') return

      // build deck

      // player can choose random deck
      deck = shuffle((it.curr_deck === 'random')? randomDeck() : (rlt[0].deck_slot[it.curr_deck].card_list) )
	  /*
      if (it.curr_deck === 'slot_1') {
		deck = [
		  'vanish',
		  'vanish',
		  'vanish',
		  'vanish',
		  'vanish',
		  'vanish',
		  'vanish',
		  'vanish',
		  'giga',
		  'epoch',
		  'plasma_wave',
		  'laser_beam'
		]
	  }
	  else if (it.curr_deck === 'slot_2') {
		deck = [
		  'vanish',
		  'vanish',
		  'vanish',
		  'vanish',
		  'vanish',
		  'havok',
		  'observer',
		  'vanish',
		  'vanish',
		  'equip_breaker',
		  'dragon_orb',
		  'heros_hymn',
		  'beer',
		  'pillow',
		  'espresso'
		]  
	  }
	  */
	  client.choose_deck[it.curr_deck] = deck
	  
      for (let card_name of deck) {
		console.log(card_name)
        let curr_card = game.default.all_card[card_name]
        let init = {
          name: curr_card.name,
          type: curr_card.type,
          field: 'deck',
          owner: client._pid
        }
        client.curr_deck.push(new Card(init))
        client.card_amount.deck += 1
		client.field_detail.deck[init.type.base] += 1
      }

      // find opponent
      if (game.queue.length) {
        let rid = idGenerate(16)
        let opponent = game.queue.shift()
        opponent._rid = rid
        opponent._foe = client
        client._rid = rid
        client._foe = opponent
        delete game.pool[client._pid]

        game.room[rid] = {
          phase: 'normal', // >> normal / attack / counter / choose / effect / socket
          atk_status: {first_atk: true, hit: false, attacker: null, defender: null, curr: null},
          counter_status: {start: null, type: null, use_id: {}, counter_id: {}, last_ply: null, success: false},
		  effect_queue: [],
          cards: {},
          card_id: 1,
          curr_ply: '',
          player: {}
        }
        let room = game.room[rid]
        room.curr_ply = opponent._pid
        room.player[opponent._pid] = opponent
        room.player[client._pid] = client

        // build all cards, life and deck
        let record_deck = {[opponent._pid]: [], [client._pid]: []}
        let life = {
            [opponent._pid]: {personal: [], opponent: []},
            [client._pid]: {personal: [], opponent: []}
        }
		let hand = {
			[opponent._pid]: {personal: [], opponent: []},
            [client._pid]: {personal: [], opponent: []}
		}
        for (let pid in room.player) {
          for (let [index, card] of room.player[pid].curr_deck.entries()) {
            let id = `card_${game.room[rid].card_id}`
			card.room = rid
			card.id = id
            room.cards[id] = card
            if (index < room.player[pid].life_max) {
              card.field = 'life'
              life[pid].personal.push({id: id, name: card.name})
              life[room.player[pid]._foe._pid].opponent.push({id: id})
              room.player[pid].card_amount.deck -= 1
              room.player[pid].card_amount.life += 1
			  room.player[pid].field_detail.deck[card.type.base] -= 1
			  room.player[pid].field_detail.life[card.type.base] += 1
            }
            else {
			  if (index < room.player[pid].life_max + ((pid === client._pid)? 4 : 3)) {
				card.field = 'hand'
                hand[pid].personal.push({id: id, name: card.name})
                hand[room.player[pid]._foe._pid].opponent.push({id: id})
                room.player[pid].card_amount.deck -= 1
                room.player[pid].card_amount.hand += 1
			    room.player[pid].field_detail.deck[card.type.base] -= 1
			    room.player[pid].field_detail.hand[card.type.base] += 1
			  }
			  else record_deck[pid].push({id: id, name: card.name})
            }
			room.card_id ++
          }
        }
        cb({})

        // game start
        opponent.emit('gameStart', {
		  card_list: {life: life[opponent._pid], deck: record_deck[opponent._pid], hand: hand[opponent._pid]}, 
		  msg: {phase: 'normal phase', action: 'your turn', cursor: ' '}, 
		  attr: {
			personal: {deck: opponent.card_amount.deck, atk_damage: opponent.atk_damage, atk_phase: opponent.atk_phase, action_point: opponent.action_point, hp: opponent.hp, hand: `${opponent.card_amount.hand}/${opponent.hand_max + Object.keys(opponent.aura.stamina).length*2}`}, 
			opponent: {deck: client.card_amount.deck, atk_damage: client.atk_damage, atk_phase: client.atk_phase, action_point: client.action_point, hp: client.hp, hand: `${client.card_amount.hand}/${client.hand_max + Object.keys(client.aura.stamina).length}`}
		  }, 
		  start: true 
		})
        client.emit('gameStart', {
		  card_list: {life: life[client._pid], deck: record_deck[client._pid], hand: hand[client._pid]}, 
		  msg: {phase: 'normal phase', action: 'opponent turn', cursor: ' '}, 
		  attr: {
			opponent: {deck: opponent.card_amount.deck, atk_damage: opponent.atk_damage, atk_phase: opponent.atk_phase, action_point: opponent.action_point, hp: opponent.hp, hand: `${opponent.card_amount.hand}/${opponent.hand_max + Object.keys(opponent.aura.stamina).length*2}`}, 
			personal: {deck: client.card_amount.deck, atk_damage: client.atk_damage, atk_phase: client.atk_phase, action_point: client.action_point, hp: client.hp, hand: `${client.card_amount.hand}/${client.hand_max + Object.keys(client.aura.stamina).length}`}
		  }, 
		  start: false
		})
	  
	    //console.log(opponent._pid, opponent.field_detail)
		//console.log(client._pid, client.field_detail)
	  }
      else {
        game.queue.push(client)
        delete game.pool[client._pid]
        cb({msg: {cursor: 'searching for match...'}})
      }
    })
  })
  
  client.on('cancelSearchMatch', (it, cb) => {
	game.queue.splice(game.queue.findIndex((ply) => {return ply._pid === client._pid}), 1)
	game.pool[client.pid] = client
	game.buildPlayer(client)
	cb({})
  })

  client.on('signUp', (it, cb) => {
    if (typeof cb !== 'function') return

    let user = app.db.collection('user')
    user.find({account: it.acc}).toArray((err, rlt) => {
      if(rlt.length) return cb({err: 'user name exists'})
      let signup = {
        account: it.acc,
        passwd: it.passwd,
        deck_slot: {
          slot_1: {name: 'deck_1', card_list: []},
          slot_2: {name: 'deck_2', card_list: []},
          slot_3: {name: 'deck_3', card_list: []}
        }
      }
      user.insert(signup, (err, result) => {
        if(err) throw err
        console.log(`player ${signup.account} added`)
        client._account = signup.account
        cb({})
      })
    })
  })

  ///////////////////////////////////////////////////////////////////////////////
  // !-- in game

  // ----------------------------------------------------------------------------
  // !-- attack
  client.on('attack', cb => {
    let room = game.room[client._rid]
    if (Object.keys(client.aura.fear).length) return cb({err: 'cant attack when fear'})
    if (client.stat.stun) return cb({err: 'cant attack when stunned'})

    if (typeof cb !== 'function') return
    if (room.phase !== 'normal') return cb( { err: `not allowed in ${room.phase} phase`} )
    if (room.curr_ply !== client._pid) return cb( {err: 'waiting for opponent'} )
    if (client.card_amount.battle == 0) return cb( {err: 'no artifact to attack'} )
    if (room.atk_status.first_atk) {
      if (client.action_point < 1) return cb( {err: 'not enough action point'} )
      room.atk_status.first_atk = false
    }
    else
      if (client.atk_phase < 1) return cb( {err: 'not enough attack phase'} )
	
    if (Object.keys(client.aura.guilt).length) {
	  let curr_atk_enchants = Object.assign({}, client.atk_enchant)	
	  let added_atk_enchants = Object.assign({}, client.aura.guilt)
	  let new_atk_enchants = Object.assign(added_atk_enchants, curr_atk_enchants)
	  client.atk_enchant = new_atk_enchants
	}		  
	
    room.phase = 'attack'
	
	room.atk_status.in_progress = true
    room.atk_status.attacker = client
    room.atk_status.defender = client._foe
    room.atk_status.curr = room.atk_status.defender
	if (room.atk_status.first_atk) client.action_point -= 1    
    client.atk_phase -= 1

    if ((Object.keys(client.aura.triumph).length && client.card_amount.battle >= 3) || Object.keys(client.aura.precise).length || client.buff.eagle_eye) {
      cb({msg: {phase: 'attack phase', action: 'attack hits'}})
	  game.buff(client, {eagle_eye: {personal: false}})
	  room.atk_status.in_progress = false
      room.atk_status.hit = true
	  
	  game.buildEffectQueue(client, {enchant: client.atk_enchant})
      //let avail_effect = game.judge(client, client._foe, {enchant: client.atk_enchant})
      //game.effectTrigger(client, client._foe, avail_effect)
    }
    else {
		
      client._foe.first_conceal = true
	  if (game.checkCounter(client._foe, 'attack')) {
		game.emitCounter(client._foe, type='attack')  
		client._foe.first_conceal = false
		room.atk_status.curr = room.atk_status.attacker
		client._foe.emit('plyUseVanish', { msg: {action: 'conceal... waiting opponent'}, rlt: {personal: true, conceal: true} })
		client.emit('plyUseVanish', { msg: {action: 'foe conceal'}, rlt: {opponent: true, conceal: true} })
	  }
	  else { 
	    client.emit('playerAttack', { msg: {phase: 'attack phase', action: 'attack... waiting opponent'}, rlt: {personal: true, attack: true}, attr: {personal: {atk_phase: client.atk_phase, action_point: client.action_point}} })
        client._foe.emit('playerAttack', { msg: {phase: 'attack phase', action: 'foe attack'}, rlt: {opponent: true, attack: true}, attr: {opponent: {atk_phase: client.atk_phase, action_point: client.action_point}} })
      }
	}
  })

  client.on('useVanish', (it, cb) => {
    let room = game.room[client._rid]
    if (it == null) return
    if (typeof cb !== 'function') return
    if (room.phase !== 'attack') return
    if (client != room.atk_status.curr) return
	
    let card_pick = Object.keys(it.card_pick)
    for (let id of card_pick) {
      let card = room.cards[id]
      if (card == null) return
      if (card.curr_own != client._pid) return
    }

    let type = {life_use: {}, hand_use: {}, hand_swap: {}}
    let action = (client == room.atk_status.attacker)? 'tracking' : 'conceal'//('conceal' in it)? 'conceal' : 'tracking'

    for (let id of card_pick) {
      let card = room.cards[id]
      if (card.field === 'life') {
        if (card.cover == true) return cb({err: 'please choose unveiled card'})
        if (card.name === 'vanish') type.life_use[id] = {}
        else return cb({err: 'please choose vanish'})
      }
      else {
        if (card.name === 'vanish') type.hand_use[id] = {}
        else type.hand_swap[id] = {to: 'life'}
      }
    }

    let life_use = Object.keys(type.life_use).length
    let hand_use = Object.keys(type.hand_use).length
    let hand_swap = Object.keys(type.hand_swap).length

    switch (card_pick.length) {
      case 1:
        if (!client.first_conceal) return cb({err: 'not in first conceal'})
        if (hand_use != 1) return cb({err: 'error card pick'})
        break

      case 2:
        if (client.first_conceal) {
          if (life_use != 1 || hand_swap != 1) return cb({err: 'error card pick'})
        }
        else {
          if (hand_use != 2) return cb({err: 'error card pick'})
        }
        break

      case 3:
        if (client.first_conceal) return cb({err: 'in first conceal'})
        if (hand_use != 1 || hand_swap != 1 || life_use != 1) return cb({err: 'error card pick'})
        break

      case 4:
        if (client.first_conceal) return cb({err: 'in first conceal'})
        if (life_use != 2 || hand_swap != 2) return cb({err: 'error card pick'})
        break

      default:
        return cb({err: 'error length of card pick'})
        break
    }
    client.first_conceal = false

    let param = Object.assign(type.hand_use, type.hand_swap, type.life_use)
    let rlt = game.cardMove(client, param)
    let panel = {}
    panel[action] = true
    
	game.drain(client, {card_pick: client.aura.decay}, use_vanish = true)
	
	if (action === 'conceal' && game.checkCounter(client._foe, 'vanish')) {
	  client.emit('playerGiveUp', { msg: {action: 'be hit... waiting opponent', cursor: ' '}, card: rlt.personal, rlt: {personal: true, give_up: true, conceal: true} })
	  client._foe.emit('playerGiveUp', { msg: {action: 'attack hits... your turn', cursor: ' '}, card: rlt.opponent, rlt: {opponent: true, give_up: true, conceal: true} })	
		
	  // effect 
	  room.atk_status.hit = true
	  client.first_conceal = false			
	  game.buildEffectQueue(room.atk_status.attacker, {enchant: room.atk_status.attacker.atk_enchant})
	  
	  // counter
	  game.emitCounter(client._foe, type='vanish')		  
	}
	else {
      client.emit('plyUseVanish', { msg: {action: `${action}... waiting opponent`}, card: rlt.personal, rlt: Object.assign({personal: true}, panel) })
      client._foe.emit('plyUseVanish', { msg: {action: `foe ${action}`}, card: rlt.opponent, rlt: Object.assign({opponent: true}, panel) })
      room.atk_status.curr = (client == room.atk_status.attacker)? (room.atk_status.defender) : (room.atk_status.attacker)
    }
  })

  client.on('giveUp', () => {
    let room = game.room[client._rid]
    if (room.phase !== 'attack') return

	room.atk_status.in_progress = false
    let action = (client == room.atk_status.attacker)? 'tracking' : 'conceal'
    let msg = {personal: '', opponent: ''}
    msg.personal = (action === 'conceal')? 'be hit... waiting opponent' : 'attack miss... your turn'
    msg.opponent = (action === 'conceal')? 'attack hits... your turn' : 'dodge attack... waiting opponent'

    let rlt = {personal: {personal: true, give_up: true}, opponent: {opponent: true, give_up: true}}
    rlt.personal[action] = true
    rlt.opponent[action] = true

    client.emit('playerGiveUp', { msg: {action: msg.personal, cursor: ' '}, rlt: rlt.personal })
    client._foe.emit('playerGiveUp', { msg: {action: msg.opponent, cursor: ' '}, rlt: rlt.opponent })
    room.atk_status.hit = (action === 'tracking')? false : true
    client.first_conceal = false

    // effect phase
	game.buildEffectQueue(room.atk_status.attacker, {enchant: room.atk_status.attacker.atk_enchant})
    //let avail_effect = game.judge(room.atk_status.attacker, room.atk_status.defender, {enchant: room.atk_status.attacker.atk_enchant} )
    //game.effectTrigger(room.atk_status.attacker, room.atk_status.defender, avail_effect)
  })

  // ----------------------------------------------------------------------------
  // !-- counter
  client.on('counter', (it, cb) => {
	return
    let room = game.room[client._rid]
    if (it == null) return
    if (typeof cb !== 'function') return
    if (room.phase !== 'counter') return
    if (client == room.counter_status.last_ply) return

    let card_pick = Object.keys(it.card_pick)
    if (card_pick.length !== 1) return cb({err: 'only allow 1 counter card a time'})

    let card = room.cards[card_pick[0]]
    if (card == null) return
    if (card.curr_own != client._pid) return

    let effect = game.default.all_card[card.name].effect[(card.type.base === 'item')? 'mosaic' : 'counter']
    if (effect == null) return cb({err: 'no counter effect'})
    let effect_type = Object.keys(effect.counter)[0]
    let effect_object = Object.keys(effect.counter[effect_type])[0]
    let counter_card = room.cards[ !Object.keys(room.counter_status.counter_id).length
      ? Object.keys(room.counter_status.use_id)[0]
      : Object.keys(room.counter_status.counter_id)[0] ]

    if (effect_type !== room.counter_status.type) return cb({err: 'counter action type mismatch'})
    if (effect_object !== 'card' && effect_object !== counter_card.type.base) return cb({err: 'counter object type mismatch'})

    let rlt = {}
    let param = {}
    param[card_pick[0]] = {from: card.field}
    room.counter_status.counter_id = param
    if (card.type.base === 'artifact') {
      card.overheat = true
      card.energy -= 1
      client.emit('playerTrigger', { msg: {action: `trigger ${card.name} to counter`}, card: {id: card_pick[0], curr_own: 'personal', from: 'battle'}, rlt: {personal: true, counter: true}  })
      client._foe.emit('playerTrigger', { msg: {action: `foe trigger ${card.name} to counter`}, card: {id: card_pick[0], curr_own: 'opponent', from: 'battle'}, rlt: {opponent: true, counter: true}, foe: true  })
    }
    else {
      if (card.type.effect.mosaic) param[card_pick[0]].off = card.bond
      rlt = game.cardMove(client, param)
      client.emit('playerCounter', { msg: {action: `use ${card.name} to counter`}, card: rlt.personal, rlt: {counter: true, personal: true} })
      client._foe.emit('playerCounter', { msg: {action: `foe use ${card.name} to counter`}, card: rlt.opponent, rlt: {counter: true, opponent: true} })
    }

    room.counter_status.type = 'trigger'
    room.counter_status.last_ply = client
  })

  client.on('pass', () => {
    let room = game.room[client._rid]
    if (room.phase !== 'counter') return
    if (client == room.last_ply) return

    //let counter = (client == room.player[room.curr_ply])? true : false
	let counter = (room.counter_status.success)? true : false

    if (counter == true) {
	  // find counter card and buildEffectQueue of it
	  
	  game.emitCounter(client)
	  /*
      let param = room.counter_status.use_id
      
      rlt = {}
      if (room.counter_status.start === 'use') {
        param[Object.keys(param)[0]] = {from: room.cards[Object.keys(param)[0]].field}
        if (room.cards[Object.keys(param)[0]].type.base !== 'artifact')
          if (room.cards[Object.keys(param)[0]].type.effect.mosaic) param[Object.keys(param)[0]].off = room.cards[Object.keys(param)[0]].bond
        rlt = game.cardMove(client, client._foe, param)
      }
      client.emit('playerPass', { msg: {phase: 'normal phase', action: 'be countered... your turn', cursor: ' '}, card: rlt.personal, rlt: {pass: true, personal: true} })
      client._foe.emit('playerPass', { msg: {phase: 'normal phase', action: 'counter success... waiting opponent', cursor: ' '}, card: rlt.opponent, rlt: {pass: true, opponent: true} })
      */
	  //game.buildEffectQueue(client._foe, {counter: room.counter_status.counter_id})
      //let avail_effect = game.judge(client, client._foe, {counter: room.counter_status.counter_id})
      //game.effectTrigger(client._foe, client, avail_effect)
    }
    else {
      client.emit('playerPass', { msg: {phase: 'normal phase', action: 'counter failed... waiting opponent', cursor: ' '}, rlt: {pass: true, personal: true} })
      client._foe.emit('playerPass', { msg: {phase: 'normal phase', action: 'action recover... your turn', cursor: ' '}, rlt: {pass: true, opponent: true} })
      let card = room.cards[Object.keys(room.counter_status.use_id)[0]]

      // action varies by counter status first action
      if (room.counter_status.start === 'use') {
        if (card.field === 'grave') {
          let param = {}
          param[(card.type.base === 'item')? 'normal' : 'instant'] = room.counter_status.use_id
          //param.counter = room.counter_status.counter_id
		  game.buildEffectQueue(client._foe, param)
        }
        else {
          room.phase = 'normal'
          if ('chanting' in card.type.effect) {
			client._foe.chanting[card.id] = {to: 'grave', status: true}
		  }
		  if ('counter' in card) {
			for (let counter_type in card.counter) {
			  client._foe.anti[counter_type][card.id] = true
			}
			console.log(`counter in ${card.name}`)
          }
		  if (game.default.all_card[card.name].aura) {
            game.aura(client._foe, room.counter_status.use_id)
            console.log(`aura in ${card.name}`)
          }
        }
      }
      else {
        room.phase = 'normal'
        if (card.type.base === 'artifact') {
          let curr_tp = {}
          if (card.curr_eff) curr_tp[card.curr_eff.split('_')[0]] = true
          else curr_tp = card.type.effect
          if (curr_tp.enchant) Object.assign(client._foe.atk_enchant, room.counter_status.use_id)
          if (curr_tp.trigger) {
			game.buildEffectQueue(client._foe, Object.assign({trigger: room.counter_status.use_id}, {counter: room.counter_status.counter_id}))
          }
        }
      }
    }

    room.counter_status = {start: null, type: null, use_id: {}, counter_id: {}, last_ply: null, success: false}
  })

  // ----------------------------------------------------------------------------
  // !-- action
  client.on('drawCard', cb => {
    let room = game.room[client._rid]
    if (Object.keys(client.aura.cripple).length) return cb({err: 'cant draw card when crippled'})
	if (client.stat.warcry) return {err: 'cant draw card when warcry'}
    if (client.stat.stun) return cb({err: 'cant draw card when stunned'})

    if (typeof cb !== 'function') return
    if (room.phase !== 'normal') return cb( { err: `not allowed in ${room.phase} phase`} )
    if (room.curr_ply !== client._pid) return cb( {err: 'waiting for opponent' } )
    if (client.action_point <= 0) return cb( {err: 'not enough action point'} )

    client.action_point -= 1

    for(let id in room.cards){
      let card = room.cards[id]
      if (card.field !== 'deck' || card.curr_own !== client._pid) continue

      let param = {}
      param[id] = {to: 'hand'}
      let rlt = game.cardMove(client, param)
      client.emit('plyDrawCard', {msg: {action: `draw ${card.name}`}, card: rlt.personal, attr: {personal: {action_point: client.action_point}}})
      client._foe.emit('plyDrawCard', {msg: {action: 'foe draw card'}, card: rlt.opponent, attr: {opponent: {action_point: client.action_point}}})

      break
    }
  })

  client.on('clickCard', (it, cb) => {	
    let room = game.room[client._rid]
    let card = room.cards[it.id]

    if (it == null) return {err: 'it = null'}
    if (typeof cb !== 'function') {err: 'cb != function'}
    if (card == null) return {err: 'card = null'}
	
    //if (card.curr_own != client._pid) return

    //let type = ((card.field === 'battle' && !('counter' in game.default.all_card[card.name].effect)) || card.field === 'altar')? 'trigger' : 'use'
	let type = (card.field === 'battle' || card.field === 'altar')? 'trigger' : 'use'
    if (type === 'use') game.checkUse(client, it, cb)
    else game.triggerCard(client, it, cb)
  })

  Game.prototype.frontEnd = function (client) {
    let room = game.room[client._rid]

    // !-- end last player turn
    // default attr
    room.atk_status.first_atk = true
    client.action_point = game.default.action_point
    client.atk_damage = game.default.atk_damage
    client.atk_phase = game.default.atk_phase
    client.atk_enchant = {}
    client.interrupt = false

    // clear stat and buff
    for (let tp of ['stat', 'buff']) {
      let param = {}
      for (let name in client[tp]) {
        if (client[tp][name]) {
          client.stat[name] = false
          param[name] = {personal: false}
        }
      }
      if (Object.keys(param).length) game[tp](client, param)
    }

    room.phase = 'end'

    // discard card request when turn ends
    if (client.card_amount.hand > client.hand_max + (((Object.keys(client.aura.stamina).length)? 1 : 0)*2)) {
      client.eff_todo.end = {end: {discard: true}}
      client.emit('effectLoop', {rlt: {name: 'end', id: 'end', eff: 'discard', tp: 'end', tg: 'personal'}})
    }
    else this.backEnd(client)
  }

  Game.prototype.backEnd = function (client) {
    let room = game.room[client._rid]
    let param = {}

    // change player
    room.curr_ply = (client.stat.charge)? client._pid : (client._foe._pid)
    room.phase = 'normal'

    // put outdated card on field to grave and unseal trigger spell
    for (let id in room.cards) {
      let card = room.cards[id]
      switch (card.field) {
        case 'battle':
          if (card.energy == 0) param[id] = {from: card.field}
          if (card.overheat) card.overheat = false
          break

        case 'altar':
          if (card.type.effect.trigger && card.lock) card.lock = false
		  if (card.id in client.chanting && !client.chanting[card.id].status) {
			param[id] = {from: card.field}
		    delete client.chanting[card.id]
		  }
		  break

        default: break
      }
    }
    let rlt = {personal: {}, opponent: {}}
    if (Object.keys(param).length) rlt = game.cardMove(client, param)

    let act_msg = (room.curr_ply === client._pid)? ['your', 'opponent'] : (['opponent', 'your'])
    client.emit('turnShift', { 
	  msg: {phase: 'normal phase', action: `${act_msg[0]} turn`, cursor: ' '}, 
	  card: rlt.personal, 
	  attr: {personal: {atk_damage: client.atk_damage, atk_phase: client.atk_phase, action_point: client.action_point}}, 
	  start: (act_msg[0] == 'your')? true : false 
	})	
    client._foe.emit('turnShift', {
	  msg: {phase: 'normal phase', action: `${act_msg[1]} turn`, cursor: ' '}, 
	  card: rlt.opponent, 
	  attr: {opponent: {atk_damage: client.atk_damage, atk_phase: client.atk_phase, action_point: client.action_point}}, 
	  start: (act_msg[1] == 'your')? true : false 
	})

    // !-- start next player turn
    let nxt_ply = (room.curr_ply === client._pid)? client : (client._foe)

	if (Object.keys(nxt_ply.chanting).length) {
      let avail_chanting = Object.keys(nxt_ply.chanting).reduce( (last, curr) => {
        if (nxt_ply.chanting[curr].status == true) {
		  last[curr] = nxt_ply.chanting[curr]
          delete nxt_ply.chanting[curr]
		}
		return last
      }, {})
	  if (Object.keys(avail_chanting).length) {
		rlt = game.cardMove(nxt_ply, avail_chanting)
        nxt_ply.emit('chantingTrigger', {card: rlt.personal})
        nxt_ply._foe.emit('chantingTrigger', {card: rlt.opponent})
		game.buildEffectQueue(nxt_ply, {chanting: avail_chanting})
      }
    }
  }

  client.on('endTurn', cb => {
    if (typeof cb !== 'function') return

    let room = game.room[client._rid]
    if (room.phase !== 'normal') return cb({ err: `not allowed in ${room.phase} phase`})
    if (room.curr_ply !== client._pid) return cb({err: 'waiting for opponent'})

    //game.endTurn(client)
    game.frontEnd(client)
  })

  // ----------------------------------------------------------------------------
  // !-- choosing
  client.on('effectChoose', (it, cb) => {
    let room = game.room[client._rid]
    if (it == null) return
    if (typeof cb !== 'function') return
    if (room.phase !== 'attack' && room.phase !== 'effect' && room.phase !== 'end') return

    let effect = (it.eff.split('_')[0] === 'damage')? (it.decision) : (it.eff.split('_')[0])

    // if can't find effect name return
    if (!(effect in game)) return {err: true}
    // if eff_id is not in client.eff_todo return
    if (!(it.id in client.eff_todo)) return {err: true}

    if (!(it.tp in client.eff_todo[it.id])) return {err: true}
    // if it.eff doesn't exist in client.eff_todo.your_id return
    if (!(it.eff in client.eff_todo[it.id][it.tp])) return {err: true}
	
	/*
    let rlt = game[effect](client, it)
    if ('err' in rlt) return cb(rlt)
    else {	  	
		
      // !-- ai bot
	  if ('eff' in rlt) {
	    client.emit('effectTrigger', rlt.eff.personal)
        client._foe.emit('effectTrigger', rlt.eff.opponent)
	  }
	  //
	  
      if (!client.hp) {
        client.emit('gameOver', {msg: {end: 'You LOSE\nclick anywhere else to leave'}})
        client._foe.emit('gameOver', {msg: {end: 'You WIN\nclick anywhere else to leave'}})
        client._foe.hp = 0
        return
      }
      else cb({})
    }
	*/
	
	if ('err' in game.requestDischarger({player: client, type: 'effect'}, {name: effect, effect: it})) return cb(rlt)
	if (!client.hp) {
      client.emit('gameOver', {msg: {end: 'You LOSE\nclick anywhere else to leave'}})
      client._foe.emit('gameOver', {msg: {end: 'You WIN\nclick anywhere else to leave'}})
      client._foe.hp = 0
      return
    }
    else cb({})
	

    delete client.eff_todo[it.id][it.tp][it.eff]
    if (!Object.keys(client.eff_todo[it.id][it.tp]).length) delete client.eff_todo[it.id][it.tp]
    if (!Object.keys(client.eff_todo[it.id]).length) delete client.eff_todo[it.id]

    if (!Object.keys(client.eff_todo).length && !Object.keys(client._foe.eff_todo).length) {
	  if (room.effect_queue.length) {
		game.effectEmitter(room)  
	  }	
	  else {	
        if (it.decision && room.phase === 'attack' && it.name === 'attack' && it.tp === 'attack' && it.id === 'attack') game.attackEnd(room)		
        else {
          if (room.phase === 'end') game.backEnd(client)
          else game.effectEnd(room)
        }
	  }
    }
  })
})

/////////////////////////////////////////////////////////////////////////////////
// server init

const game = new Game()

server.listen(process.env.PORT || opt.serv_port, '0.0.0.0', function() {  
  console.log(`listen on port ${opt.serv_port}`)
})

