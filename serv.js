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
  mongo: JSON.parse(fs.readFileSync('option.json', 'utf-8')).mongo,
  serv_port: 1350
}
//opt.url = `mongodb://${opt.mongo.account}:${opt.mongo.passwd}@localhost/${opt.mongo.dbname}`
opt.url = `mongodb://${opt.mongo.account}:${opt.mongo.passwd}@merry.ee.ncku.edu.tw:27017/${opt.mongo.dbname}`

const app = {
  db: null,
  file: {
    preload: JSON.parse(fs.readFileSync('preload.json', 'utf-8')),
	backup_cardlist: JSON.parse(fs.readFileSync('card.json', 'utf-8')),
	backup_statlist: JSON.parse(fs.readFileSync('stat.json', 'utf-8'))
  }
}

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
    /*  
    this.counter = {}
    let effect = game.default.all_card[this.name].effect
    //console.log(effect)
    
	tp_tg = ('eff_choice' in this)? this.eff_choice : this.type.effect
    for (let eff_tp in tp_tg) {
	  if ('counter' in effect[eff_tp])
	    this.counter[eff_tp] = effect[eff_tp].counter
    }
	
	if (!Object.keys(this.counter).length) 
	  delete this.counter
    */
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
}

Card.prototype.checkMultiType = function () {
  let eff_tp = Object.keys(this.type.effect)
  if (eff_tp.length == 1 && this.type.effect[eff_tp[0]] == 1) return {}
  if (eff_tp.length == 2 && this.type.effect.counter) return {}
  if (this.name === 'vanish') return {}

  if (eff_tp.length == 1) eff_tp = [`${eff_tp[0]}_1`, `${eff_tp[0]}_2`]
  let eff_str = game.default.all_card[this.name].text.split('\n')
  let rlt = {}
  for (let i of [0, 1]) rlt[eff_tp[i]] = eff_str[2*i+1] + '\n' + eff_str[2*i+2]
  return rlt
}

const Game = function () {
  this.default = {
    all_card    : {},
    all_stat    : {},
    // card type
    artifact_max: 5,//13,
    spell_max   : 3,//14,
    item_max    : 2,//12,
    vanish_max  : 4,//11
    // player attribute
    atk_damage  : 1,
    atk_phase   : 1,
    action_point: 1,
    deck_max    : 14, // 50
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
    recall  : true,
    heal    : true,
    receive : true, // card you flip for life loss
    retrieve: true,
    steal   : true,
    teleport: true
  }
  this.card_reveal_target = { //
    steal: 'opponent',
    retrieve: 'personal',
    recall: 'personal'
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
  client.choose_deck = {}

  // action
  client.interrupt = false

  // effect
  client.atk_enchant = {}
  client.aura = { // permenent till be counter or remove
    decay  : {}, // turn down cards in this list when use vanish
    cripple: {}, // can't draw card
    disease: {}, // can't heal
    silence: {}, // can't use life field card
    fear   : {}, // can't attack

    fortify : {}, // your artifacts can't be destroy or break or turn 
    triumph : {}, // atk cant be vanish when artifact > 3 on battle
    precise : {}, // atk cant be vanish
    stamina : {}, // handcard limit + 2
    recycle : {}, // draw 1 card when an artifact send to grave
    berserk : {},  // equip wont cost action point
  }
  client.buff = { // next action trigger
    mana_tide : false, // next spell this turn won't cost action point
    quick_draw: false, // next equip this turn won't cost action point
    eagle_eye : false // next attack you perform can't be vanish
  }
  client.stat = {
    charge   : false, // add one additional turn
    stun     : false, // can only use item
    petrify  : false, // can only draw card
    freeze   : false  // can't attack and use item
  }
  client.anti = { 
	card: {},
	spell: {},
	item: {},
	artifact: {},
	effect: {},
	damage: {}  
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
    
	//if (!('new_own' in rlt[id])) rlt[id].new_own = (card.owner === personal._pid)? 'personal' : 'opponent'
	if (!('to' in rlt[id])) rlt[id].to = 'grave'
	
	if (!('new_own' in rlt[id])) {
	  if ((rlt[id].to === 'grave' || rlt[id].to === 'hand') && (rlt[id].from !== 'deck' && rlt[id].from !== 'life' && rlt[id].from !== 'grave')) {
		rlt[id].new_own = origin_owner  
	  }
	  else {
		rlt[id].new_own = rlt[id].curr_own
	  }
	}
    
    if (rlt[id].to === 'grave' || rlt[id].to === 'hand' || ((rlt[id].to === 'deck' || rlt[id].to === 'life') && card.field !== 'hand') ) {
      if (game.default.all_card[card.name].aura) {
		//aura_modify.personal[id] = false
		aura_modify[rlt[id].curr_own][id] = false
	  }
	  if ('counter' in card) {
		/*
	    let effect_type = Object.keys(card.counter)[0]
	    let counter_type = Object.keys(card.counter[effect_type])[0]
	    if (card.id in player[rlt[id].curr_own].anti[counter_type])
		  delete player[rlt[id].curr_own].anti[counter_type][card.id]
        */
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
      if ((card.field === rlt[id].to && card.curr_own !== player[rlt[id].new_own]._pid) || (rlt[id].from === 'grave' && rlt[id].to === 'battle')) {
        if (game.default.all_card[card.name].aura) {
          //aura_modify.personal[id] = false
          //aura_modify.opponent[id] = true
		  aura_modify[rlt[id].curr_own][id] = false
		  aura_modify[rlt[id].new_own][id] = true
        }
      }
    }
		
    if (card.socket && Object.keys(card.socket).length) {
      //let tmp = game.cardMove(personal, Object.assign({}, card.socket))
      //Object.assign(param.personal, tmp.personal)
      //Object.assign(param.opponent, tmp.opponent)
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
      //console.log('skt')
      //game.room[personal._rid].cards[rlt[id].on].socket[id] = {off: rlt[id].on}
	  room.cards[rlt[id].on].socket[id] = {off: rlt[id].on}
      card.bond = rlt[id].on
    }
    if (rlt[id].off) {
      //delete game.room[personal._rid].cards[rlt[id].off].socket[id]
	  delete room.cards[rlt[id].off].socket[id]
      card.bond = null
    }

    // move card
    rlt[id].from = card.field
    player[rlt[id].curr_own].card_amount[rlt[id].from] -= 1
    card.field = rlt[id].to
    player[rlt[id].new_own].card_amount[rlt[id].to] += 1
    card.curr_own = player[rlt[id].new_own]._pid
    //if (!personal.card_amount.deck) rlt[id].deck_empty = 'personal'
	if (!player[rlt[id].curr_own].card_amount.deck) rlt[id].deck_empty = rlt[id].curr_own
	
    if ((rlt[id].from === 'hand' || rlt[id].from === 'deck' || rlt[id].from === 'grave') && (rlt[id].to === 'life' || rlt[id].to === 'battle' || rlt[id].to === 'altar' || rlt[id].to === 'socket')) {
	  card.cover = false	
	}
	else if (rlt[id].to === 'hand' || rlt[id].to === 'grave') {
	  card.cover = true
	}
	
    // build return object
    param.personal[id] = {}
	if (rlt[id].to === 'hand' && rlt[id].new_own === 'opponent') {
	  rlt[id].cover = true
	  if (rlt[id].from === 'deck') delete rlt[id].name
    } 
	else rlt[id].cover = false
    Object.assign(param.personal[id], rlt[id])
	
    param.opponent[id] = {}
    rlt[id].curr_own = (rlt[id].curr_own === 'personal')? 'opponent' : 'personal'
    rlt[id].new_own = (rlt[id].new_own === 'personal')? 'opponent' : 'personal'
    if (rlt[id].deck_empty) rlt[id].deck_empty = (rlt[id].deck_empty === 'personal')? 'opponent' : 'personal'

    //rlt[id].cover = (rlt[id].off)? true : false

    if (rlt[id].to === 'hand' && rlt[id].new_own === 'opponent') {
      rlt[id].cover = true
	  if (rlt[id].from === 'deck') delete rlt[id].name
    }
	else rlt[id].cover = false

    Object.assign(param.opponent[id], rlt[id])
	//Object.assign(param[opposite_ply][id], rlt[id])
  }

  if (Object.keys(aura_modify.personal)) game.aura(personal, aura_modify.personal)
  if (Object.keys(aura_modify.opponent)) game.aura(personal._foe, aura_modify.opponent)
  //console.log(param.opponent)
  //console.log(param.personal)

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
  else {
    room.phase = 'normal'
    if (room.player[room.curr_ply].interrupt) {
      // end turn immediately
      //game.endTurn(room.player[room.curr_ply])
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

Game.prototype.emitCounter = function (personal, type = null) {
  // personal = who own counter card
  let room = this.room[personal._rid]
  let cnt_type = (type == null)? room.counter_status.type : type
  let anti_queue = Object.keys(personal.anti[cnt_type])
  let card_id = anti_queue[0]
 
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
	if (card.type.base === 'artifact') {
	  if (card.overheat == true || card.energy < 1) return false  
	}
	return true
  }
  else {
	if (type !== 'damage' && type !== 'effect') {
	  let anti_card = Object.keys(personal.anti.card)
	  if (anti_card.length) {
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

  if (!client.card_pause.choose) {
    if (room.phase === 'effect' || room.phase === 'attack' || room.phase === 'end') return cb( { err: 'choose'} )
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
      //if (Object.keys(client.aura.dicease).length && game.default.all_card[card.name].effect.heal) return cb({err: 'cant use heal effect cards when diceased'})
      if (room.cards[it.id].type.base === 'vanish') return cb( {err: 'only available in atk phase'} )
      if ((client.stat.stun ||client.action_point <= 0) && room.cards[it.id].type.base !== 'item') return cb( {err: 'not enough action point'} )
      if (card.field === 'life' && client.card_amount.hand == 0) return cb( {err: 'no handcard to replace'} )
      if (card.field === 'life' && Object.keys(client.aura.silence).length) return cb({err: 'cant use life field cards when silenced'})
    }
    else
      if(card.field === 'life') return cb( {err: 'its not a handcard'} )
  }

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
  /*
  client.emit('plyUseCard', { msg: {phase: 'normal phase', action: msg}, card: rlt.personal })
  client._foe.emit('plyUseCard', { msg: {phase: 'normal phase', action: `foe ${msg}`}, card: rlt.opponent, foe: true })
  */
  client.emit('plyUseCard', { msg: {phase: 'counter phase', action: msg}, card: rlt.personal })
  client._foe.emit('plyUseCard', { msg: {phase: 'counter phase', action: `foe ${msg}`}, card: rlt.opponent, foe: true })

  room.phase = 'counter'
  room.counter_status.type = room.cards[use_id].type.base
  room.counter_status.start = 'use'
  room.counter_status.last_ply = client
}

Game.prototype.triggerCard = function (client, it, cb) {
  // pre-checking ...
  let room = game.room[client._rid]
  let card = room.cards[it.id]

  if (room.phase === 'counter' || room.phase === 'effect') return cb({err: 'choose'})
  if (room.curr_ply !== client._pid) return cb({err: 'waiting for opponent'})
  if (card.curr_own !== client._pid) return cb( {err: 'cant trigger opponent card'})
  if (room.phase === 'socket') {
    if (card.type.base !== 'artifact') return cb({err: 'can only socket on artifact'})
      client.card_pause['socket'] = it.id
      return game.useCard(client)
  }
  if (room.phase !== 'normal') return cb({err: `not allowed in ${room.phase} phase`})
  if ('counter' in card && Object.keys(game.default.all_card[card.name].type.effect).length == 1) 
	  return cb({err: 'only available in counter phase'})
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
      //let avail_effect = game.judge(client, client._foe, param)
      //game.effectTrigger(client, client._foe, avail_effect)
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
      let judge = this.default.all_card[card.name].judge[tg_tp]

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

// effectEmitter emits one effect at a time, stops at one card's effects
Game.prototype.effectEmitter = function (room) {
  //console.log(room.effect_queue)
  let card_eff = this.effectJudge(room.effect_queue.shift())
  let personal = card_eff.initiator
  let opponent = personal._foe
  let player = {personal: personal, opponent: opponent}

  // effect phase of attack enchant will count as attack phase
  if(room.phase !== 'attack') room.phase = 'effect'
  personal.emit('phaseShift', {msg: {phase: `${room.phase} phase`}})
  opponent.emit('phaseShift', {msg: {phase: `${room.phase} phase`}})
  
  for (let avail_eff of card_eff.eff) {
	let eff_name = avail_eff.split('_')[0]	
	let eff_core = Object.assign({}, this.default.all_card[card_eff.name].effect[card_eff.tp][avail_eff])
    if (!(eff_name in this.choose_eff)) {
	  this[eff_name](personal, eff_core)	
	}
	else {
	  for (let target in eff_core) {
        let tmp = {id: card_eff.id, name: card_eff.name, eff: avail_eff, tp: card_eff.tp, tg: target}
        
        if (eff_name === 'damage') {
		  if (this.checkCounter(player[target], 'damage')) {
		    room.phase = 'counter_effect'
			this.emitCounter(player[target], 'damage')
			continue
		  }
          else {
			player[target].dmg_blk.push(eff_core[target])
          }
		}
        else if (eff_name === 'heal') {        
		  if (player[target].hp == player[target].life_max) continue 
		  //if (Object.keys(player[target].aura.dicease).length) continue
		}
        else if (eff_name === 'steal') {
		  if (opponent.card_amount.hand == 0) continue
          if (!('ext' in tmp)) tmp.ext = {}
          tmp.ext.hand = Object.keys(this.room[personal._rid].cards).reduce( (last, curr) => {
            if (this.room[personal._rid].cards[curr].curr_own === opponent._pid && this.room[personal._rid].cards[curr].field === 'hand')
              last[curr] = this.room[personal._rid].cards[curr].name
            return last
          }, {})
        }
        else if (eff_name === 'retrieve') {
		  if (personal.card_amount.deck == 0) continue
          if (!('ext' in tmp)) tmp.ext = {}
          tmp.ext.deck = Object.keys(this.room[personal._rid].cards).reduce( (last, curr) => {
            if (this.room[personal._rid].cards[curr].curr_own === personal._pid && this.room[personal._rid].cards[curr].field === 'deck')
              last[curr] = this.room[personal._rid].cards[curr].name
            return last
          }, {})
        }
		else if (eff_name === 'recall') {
		  if (personal.card_amount.grave == 0) continue
          if (!('ext' in tmp)) tmp.ext = {}
          tmp.ext.deck = Object.keys(this.room[personal._rid].cards).reduce( (last, curr) => {
            if (this.room[personal._rid].cards[curr].curr_own === personal._pid && this.room[personal._rid].cards[curr].field === 'grave')
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
	  }	
	}
  }
  
  this.checkEffectDone(personal)
}

Game.prototype.checkEffectDone = function (personal) {
  let room = this.room[personal._rid]
  let curr_phase = room.phase.split('_')
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
  let personal = card_eff.initiator
  let opponent = personal._foe	
  
  let room = this.room[personal._rid]
  let player = {personal: personal, opponent: opponent}
  let judge = this.default.all_card[card_eff.name].judge[card_eff.tp]
  
  let avail_eff = []
  for (let effect of card_eff.eff) {
	if(!Object.keys(judge[effect]).length) {
	  //if (effect !== 'counter') avail_eff.push(effect)
	  avail_eff.push(effect)
	}  
    else {
	  let pass = true	
	  
	  for (let target in judge[effect]) {		
        for (let condition in judge[effect][target]) {
          let curr_val = null
          switch (condition) {
            case 'hit':
              //if (room.atk_status.hit) avail_eff.push(effect)
              pass = pass && room.atk_status.hit
		      break
			  
            case 'hp':
              curr_val = player[target].hp
			  pass = pass && operation(curr_val, judge[effect][target][condition])
              break
			  
            case 'handcard':
              curr_val = player[target].card_amount.hand
			  pass = pass && operation(curr_val, judge[effect][target][condition])
              break
			  
            case 'battle':
              curr_val = player[target].card_amount.battle
			  pass = pass && operation(curr_val, judge[effect][target][condition])
              break	  
			  
			case 'aura':
			  pass = pass && checkAura(player[target].aura, judge[effect][target][condition])
			  break
			
            default:break
          }

          //if (condition !== 'hit')
            //pass = pass && operation(curr_val, judge[effect][target][condition])
		    //if (operation(curr_val, judge[effect][target][condition])) 
			//	avail_eff.push(effect)
        }
      }

      if (pass) avail_eff.push(effect)		  
	}
  }
  card_eff.eff = avail_eff
  return card_eff
}






/////////////////////////////////////////////////////////////////////////////////
// !-- effect apply

Game.prototype.effectTrigger = function (personal, opponent, card_list) {
  // card_list = {
  //   type_1: {
  //     card_id_1: [effect1, effect2 ...],
  //     card_id_2 ...
  //   },
  //   type_2: {}
  // }
  //
  // effect = { effect: { target: { field: { type: value } } } }
  let room = this.room[personal._rid]
  let player = {personal: personal, opponent: opponent}

  console.log(card_list)

  // effect phase of attack enchant will count as attack phase
  if(room.phase !== 'attack') room.phase = 'effect'
  personal.emit('phaseShift', {msg: {phase: `${room.phase} phase`}})
  opponent.emit('phaseShift', {msg: {phase: `${room.phase} phase`}})

  for (let tp in card_list) {
    for (let id in card_list[tp]) {
      let card_name = this.room[personal._rid].cards[id].name
      for (let avail_effect of card_list[tp][id]) {
        let effect_name = avail_effect.split('_')[0]
        let effect = this.default.all_card[card_name].effect[tp][avail_effect]

        if (this.choose_eff[effect_name]) {
          for (let target in effect) {
            let tmp = {id: id, name: card_name, eff: avail_effect, tp: tp, tg: target}

            if (effect_name === 'damage')
              player[target].dmg_blk.push(effect[target])

            if (effect_name === 'steal') {
              if (!('ext' in tmp)) tmp.ext = {}
              tmp.ext.hand = Object.keys(this.room[personal._rid].cards).reduce( (last, curr) => {
                if (this.room[personal._rid].cards[curr].curr_own === opponent._pid && this.room[personal._rid].cards[curr].field === 'hand')
                  last[curr] = this.room[personal._rid].cards[curr].name
                return last
              }, {})
            }
            if (effect_name === 'retrieve') {
              if (!('ext' in tmp)) tmp.ext = {}
              tmp.ext.deck = Object.keys(this.room[personal._rid].cards).reduce( (last, curr) => {
                if (this.room[personal._rid].cards[curr].curr_own === personal._pid && this.room[personal._rid].cards[curr].field === 'deck')
                  last[curr] = this.room[personal._rid].cards[curr].name
                return last
              }, {})
            }

            player[target].emit('effectLoop', {rlt: tmp})

            if (!(id in player[target].eff_todo)) player[target].eff_todo[id] = {}
            if (!(tp in player[target].eff_todo[id])) player[target].eff_todo[id][tp] = {}
            player[target].eff_todo[id][tp][avail_effect] = true
          }
        }
        else
          game[effect_name](personal, effect)
      }
    }
  }
  if (!Object.keys(personal.eff_todo).length && !Object.keys(opponent.eff_todo).length) this.effectEnd(room)
}

Game.prototype.judge = function (personal, opponent, card_list) {
  // card_list = {type: {list}}
  // console.log(card_list)
  let room = this.room[personal._rid]
  let player = {personal: personal, opponent: opponent}
  let avail_effect = {}

  for (let tp in card_list) {
    //avail_effect[tp] = {}
    for (let id in card_list[tp]) {
      let card = room.cards[id]
      let tg_tp = (card.curr_eff)? card.curr_eff : (tp)
      let judge = this.default.all_card[card.name].judge[tg_tp]

      if (!avail_effect[tg_tp]) avail_effect[tg_tp] = {}
      avail_effect[tg_tp][id] = []

      for (let effect in judge) {
        // for effects don't need to judge
        if(!Object.keys(judge[effect]).length) {
          if (effect !== 'counter') avail_effect[tg_tp][id].push(effect)
        }
        // for effects with judges
        else {
          for (let target in judge[effect]) {
            for (let condition in judge[effect][target]) {
              let curr_val = null

              switch (condition) {
                case 'hit':
                  if (room.atk_status.hit) avail_effect[tg_tp][id].push(effect)
                  break
                case 'hp':
                  curr_val = player[target].hp
                  break
                case 'handcard':
                  curr_val = player[target].card_amount.hand
                  break
                case 'battle':
                  curr_val = player[target].card_amount.battle

                default:break
              }

              if (condition !== 'hit')
                if (operation(curr_val, judge[effect][target][condition])) avail_effect[tg_tp][id].push(effect)
            }
          }
        }
      }
    }
  }
  return avail_effect
}

/////////////////////////////////////////////////////////////////////////////////
// !-- card effects
Game.prototype.bleed = function (personal, param) {
  let room = this.room[personal._rid]
  let effect = game.default.all_card[param.name].effect[param.tp][param.eff]
  let card_pick = Object.keys(param.card_pick)
  let rlt = { card: {bleed: {personal: {}, opponent: {}}} }
  let bleed = ((personal.hp - effect[param.tg]) < 0)? personal.hp : (effect[param.tg])//effect[Object.keys(effect)[0]]
  if (card_pick.length != bleed) return {err: 'error length of card pick'}

  // check err
  for (let id of card_pick) {
    let card = room.cards[id]
    if (card == null) return {err: 'no card id'}
    if (card.curr_own !== personal._pid) return {err: 'please choose your card'}
    if (card.field !== 'life') return {err: 'can only choose life field card'}
    if (!card.cover) return {err: 'cant pick card is unveiled'}
  }

  // effect
  for (let id of card_pick) {
    let card = room.cards[id]
    card.cover = false
    rlt.card.bleed.personal[id] = card.name
  }

  personal.hp -= bleed
  personal.emit('effectTrigger', rlt)
  personal._foe.emit('effectTrigger', {card: genFoeRlt(rlt.card)})
  return {}
}

Game.prototype.block = function (personal, param) {
  let room = this.room[personal._rid]
  let card_pick = Object.keys(param.card_pick)
  // if block only under trigger type effect

  if (card_pick.length != 1) return {err: 'can only choose one card'}
  for (let id of card_pick) {
    let card = room.cards[id]
    if (card == null) return {err: 'no card id'}
    if (card.curr_own !== personal._pid) return {err: 'please choose your card'}
    if (card.field === 'life' || card.field === 'hand') return {err: 'can only choose battle, altar, socket card'}
    let eff = game.default.all_card[card.name].effect
    if (eff.counter) if(!eff.counter.block) return {err: 'no block effect'}
    if (eff.mosaic) if(!eff.mosaic.block) return {err: 'no block effect'}

    if (card.type.base === 'artifact') {
      if (card.overheat) return {err: 'artifact overheat'}
      if (card.energy <= 0) return {err: 'not enough energy'}
    }
  }

  let tmp = { personal: {} }
  for (let id of card_pick) {
    let card = room.cards[id]
    if (card.type.base === 'item') {
      let param = {}
      param[id] = {from: card.field, to: 'grave'}
      if (card.type.effect.mosaic) param[id].off = card.bond
      tmp = game.cardMove(personal, param)
    }
    if (card.type.base === 'artifact') {
      card.overheat = true
      card.energy -= 1
      tmp.personal[id] = {turn_dn: true}
      tmp.opponent = tmp.personal
    }
    personal.dmg_blk.shift()
  }

  personal.emit('effectTrigger', {card:{block:{ personal: tmp.personal, opponent: {} }}})
  personal._foe.emit('effectTrigger', {card:{block:{ personal: {}, opponent: tmp.opponent }}})
  return {}
}

Game.prototype.aura = function (personal, card_list) { // card_list = {cid: true, ...}
  let player = {personal: personal, opponent: personal._foe}
  let rlt = { stat: {personal: {}, opponent: {}} }
  let room = this.room[personal._rid]

  for (let cid in card_list) {
    let eff = game.default.all_card[room.cards[cid].name].aura
    for (let tp in eff) {
      for (let tg in eff[tp]) {
        if (card_list[cid] == true) {
          player[tg].aura[tp][cid] = true
          rlt.stat[tg][tp] = true
        }
        else {
          delete player[tg].aura[tp][cid]
          rlt.stat[tg][tp] = false
        }
        /*
        if (player[tg].aura[tp][cid]) {
          delete player[tg].aura[tp][cid]
          rlt.stat[tg][tp] = false
        }
        else {
          player[tg].aura[tp][cid] = true
          rlt.stat[tg][tp] = true
        }
        */
      }
    }
  }

  personal.emit('effectTrigger', rlt)
  personal._foe.emit('effectTrigger', genFoeRlt(rlt))

  //console.log(personal.aura.cripple)

  return {}
}

Game.prototype.buff = function (personal, effect) {
  let player = {personal: personal, opponent: personal._foe}
  let rlt = { stat: {personal: {}, opponent: {}} }
  for (let name in effect) {
    for (let target in effect[name]) {
      player[target].buff[name] = effect[name][target]
      rlt.stat[target][name] = effect[name][target]
    }
  }
  personal.emit('effectTrigger', rlt)
  personal._foe.emit('effectTrigger', genFoeRlt(rlt))
  return {}
}

Game.prototype.stat = function (personal, effect) {
  let player = {personal: personal, opponent: personal._foe}
  let rlt = { stat: {personal: {}, opponent: {}} }

  for (let name in effect) {
    for (let target in effect[name]) {
      let tp = (name === 'all')? Object.keys(player[target].stat) : [name]
      for (let stat_name of tp) {
        player[target].stat[stat_name] = effect[name][target]
        rlt.stat[target][stat_name] = effect[name][target]
      }
    }
  }
  personal.emit('effectTrigger', rlt)
  personal._foe.emit('effectTrigger', genFoeRlt(rlt))
  return {}
}

Game.prototype.control = function (personal, param) {
  let room = this.room[personal._rid]
  let effect = game.default.all_card[param.name].effect[param.tp][param.eff]
  let card_pick = Object.keys(param.card_pick)
  let rlt = {}

  if (card_pick.length != 1) return {err: 'can only choose one card'}
  for (let id of card_pick) {
    let card = room.cards[id]
    if (card == null) return {err: 'no card id'}
    if (card.curr_own !== personal._foe._pid) return {err: 'please choose opponent card'}
    if (!effect.personal[card.field]) return {err: 'wrong type of chosen card field'}
    if (!effect.personal[card.field][card.type.base]) return {err: 'wrong type of chosen card type'}

    let param = {}
    //param[id] = {from: card.field, to: card.field, new_own: 'opponent'}
	param[id] = {from: card.field, to: card.field, new_own: 'personal'}
    //rlt = this.cardMove(personal._foe, param)
	rlt = this.cardMove(personal, param)
  }

  //personal.emit('effectTrigger', {card:{control:{ personal: rlt.opponent, opponent: {} }}})
  //personal._foe.emit('effectTrigger', {card:{control:{ personal: {}, opponent: rlt.personal }}})
  personal.emit('effectTrigger', {card:{control:{ personal: rlt.personal, opponent: {} }}})
  personal._foe.emit('effectTrigger', {card:{control:{ personal: {}, opponent: rlt.opponent }}})
  return {}
}

// break = choose card to send to grave
Game.prototype.break = function (personal, param) {
  let room = this.room[personal._rid]
  let effect = Object.assign({}, game.default.all_card[param.name].effect[param.tp][param.eff][param.tg])

  let card_pick = Object.keys(param.card_pick)
  let total_len = 0
  for (let tp in effect) {
    total_len += effect[tp]
  }
  if (card_pick.length != total_len) return {err: 'error break length'}

  for (let id in param.card_pick) {
    let card = room.cards[id]
    if (card == null) return {err: 'no card id'}
    if (card.curr_own !== personal._foe._pid) return {err: 'please choose opponent card'}
    if (card.field !== 'battle' && card.field !== 'altar') return {err: 'error chosen card field'}
    if (!('card' in effect) && !(card.type.base in effect)) return {err: 'error card type'}
    if (!effect[('card' in effect)? 'card' : card.type.base]) return {err: 'error type length'}
    effect[('card' in effect)? 'card' : card.type.base] --
    //param.card_pick[id] = {new_own: 'personal', to: 'grave'}
    param.card_pick[id] = {to: 'grave'}
  }

  //let rlt = this.cardMove(personal._foe, param.card_pick)
  let rlt = this.cardMove(personal, param.card_pick)

  //personal.emit('effectTrigger', {card: {break: { personal: rlt.opponent, opponent: {} }}})
  //personal._foe.emit('effectTrigger', {card: {break: { personal: {}, opponent: rlt.personal }}})
  personal.emit('effectTrigger', {card: {break: { personal: rlt.personal, opponent: {} }}})
  personal._foe.emit('effectTrigger', {card: {break: { personal: {}, opponent: rlt.opponent }}})
  
  return {}
}

// destroy = send all cards in specific field to grave
Game.prototype.destroy = function (personal, effect) {
  let room = this.room[personal._rid]
  let player = {personal: personal, opponent: personal._foe}
  let mod_eff = Object.assign({}, effect)
  //let rlt = { card: { destroy: { personal: {}, opponent: {} } } }

  // remove effect which is canceled by aura

  let rlt = {}

  for (let tg in mod_eff) {
    if (Object.keys(player[tg].aura.solidity).length) delete mod_eff[tg].battle
  }

  let tmp = {personal: {}, opponent: {}}
  for (let id in room.cards) {
    let card = room.cards[id]
    let curr_own = (card.curr_own === personal._pid)? 'personal' : 'opponent'
    if (!mod_eff[curr_own]) continue
    if (!mod_eff[curr_own][card.field]) continue
    tmp[curr_own][id] = {from: card.field, to: 'grave'}
  }

  for (let tg in mod_eff) {
    if (!Object.keys(mod_eff[tg]).length) continue
    rlt = this.cardMove(player[tg], tmp[tg])
    player[tg].emit('effectTrigger', {card: {destroy: { personal: rlt.personal, opponent: {} }}})
    player[tg]._foe.emit('effectTrigger', {card: {destroy: { personal: {}, opponent: rlt.opponent }}})
  }

  return {}
}

Game.prototype.discard = function (personal, param) {
  let room = this.room[personal._rid]
  let effect = (room.phase === 'end')
               ? {card: personal.card_amount.hand + Object.keys(personal.aura.stamina).length*2 - personal.hand_max}
               : Object.assign({}, game.default.all_card[param.name].effect[param.tp][param.eff][param.tg])

  let card_pick = Object.keys(param.card_pick)
  let total_len = 0
  for (let tp in effect) {
    total_len += effect[tp]
  }
  if (card_pick.length != total_len) return {err: 'error discard length'}

  for (let id in param.card_pick) {
    let card = room.cards[id]
    if (card == null) return {err: 'no card id'}
    if (card.curr_own !== personal._pid) return {err: 'please choose your card'}
    if (card.field !== 'hand') return {err: 'please choose hand card'}
    if (!('card' in effect) && !(card.type.base in effect)) return {err: 'error card type'}
    if (!effect[('card' in effect)? 'card' : card.type.base]) return {err: 'error type length'}
    effect[('card' in effect)? 'card' : card.type.base] --
  }

  let rlt = this.cardMove(personal, param.card_pick)
  personal.emit('effectTrigger', {card: {discard: { personal: rlt.personal, opponent: {} }}})
  personal._foe.emit('effectTrigger', {card: {discard: { personal: {}, opponent: rlt.opponent }}})
  return {}
}

Game.prototype.drain = function (personal, param, use_vanish = false) {
  let room = this.room[personal._rid]
  let player = {personal: personal, opponent: personal._foe}
  let rlt = {personal: {}, opponent: {}}
  
  if (!use_vanish) {
    let effect = Object.assign({}, game.default.all_card[param.name].effect[param.tp][param.eff][param.tg])
    let card_pick = Object.keys(param.card_pick)
    let total_len = 0
  
    for (let target in effect) {
      total_len += effect[target]
    }
    if (card_pick.length != total_len) return {err: 'error drain length'}
  
    for (let id in param.card_pick) {
      let card = room.cards[id]
	  let card_owner = (card.curr_own === personal._pid)? 'personal' : 'opponent'
      if (card == null) return {err: 'no card id'}
      if (card.field !== 'battle') return {err: 'please choose card on battle field'}
      if (!(card_owner in effect)) return {err: 'error card owner'}
      if (!effect[card_owner]) return {err: 'error owner length'}
      effect[card_owner] --
    }
  }
  else {
    if (!Object.keys(param.card_pick).length) return
  }

  let aura_modify = {personal: {}, opponent: {}}
  for (let id in param.card_pick) {
    let card = room.cards[id]
	if (card.energy < 1 || (card.overheat && use_vanish)) continue
	
	let card_owner = (card.curr_own === personal._pid)? 'personal' : 'opponent'
	card.energy -= 1
	if (use_vanish) card.overheat = true
	
    if (card.energy == 0 && this.default.all_card[card.name].aura) aura_modify[card_owner][card.id] = false
	rlt[card_owner][id] = {turn: 'down'}
  }	
  
  personal.emit('effectTrigger', {card: {drain: { personal: rlt.personal, opponent: rlt.opponent }}})
  personal._foe.emit('effectTrigger', {card: {drain: { personal: rlt.opponent, opponent: rlt.personal }}})
  
  if (Object.keys(aura_modify.personal)) this.aura(personal, aura_modify.personal)
  if (Object.keys(aura_modify.opponent)) this.aura(personal._foe, aura_modify.opponent)
  
  return {}
}

Game.prototype.draw = function (personal, effect) {
  let room = this.room[personal._rid]
  let player = {personal: personal, opponent: personal._foe}
  let rlt = {personal: {}, opponent: {}}

  for (let target in effect) {
    for (let object in effect[target]) {
      let val = effect[target][object]
      let tmp = {}
      for (let id in room.cards) {
        let card = room.cards[id]
        if (card.field === 'deck' && card.curr_own === player[target]._pid) {
          tmp[id] = {to: 'hand'}
          val --
        }
        if (!val || (val && (val == effect[target][object] - player[target].card_amount.deck)) ) break
      }
      let rtn = game.cardMove(player[target], tmp)
      Object.assign(rlt[target], rtn.personal)
      Object.assign(rlt[(target === 'personal')? 'opponent' : 'personal'], rtn.opponent)
    }
  }

  personal.emit('effectTrigger', {card: {draw: {personal: rlt.personal, opponent: {} } } })
  personal._foe.emit('effectTrigger', {card: {draw: {opponent: rlt.opponent, personal: {} } } })

  return {}
}

Game.prototype.equip = function(personal, param) {
  // check artifact aura
  let effect = game.default.all_card[param.name].effect[param.tp][param.eff]
  let rlt = { card: {} }
  for (let target in effect) {
    for (let object in effect[target]) {
      for (let type in effect[target][object]) {
        rlt.card['equip'] = {}
      }
    }
  }
  personal.emit('effectTrigger', rlt)
  personal._foe.emit('effectTrigger', rlt)
  return {}
}

Game.prototype.heal = function (personal, param) {
  let room = this.room[personal._rid]
  let effect = game.default.all_card[param.name].effect[param.tp][param.eff]
  let card_pick = Object.keys(param.card_pick)
  let rlt = { card: {heal: {personal: {}, opponent: {}}} }
  let heal = (personal.life_max - effect[Object.keys(effect)[0]] < personal.hp)? (personal.life_max - personal.hp) : effect[Object.keys(effect)[0]]
  if (card_pick.length != heal) return {err: 'error length of card pick'}
  if (heal == 0) return {}

  for (let id of card_pick) {
    let card = room.cards[id]
    if (card == null) return {err: 'no card id'}
    if (card.curr_own !== personal._pid) return {err: 'please choose your card'}
    if (card.field !== 'life') return {err: 'can only choose life field card'}
    if (card.cover) return {err: 'cant pick card is cover'}
  }

  for (let id of card_pick) {
    let card = room.cards[id]
    card.cover = true
    rlt.card.heal.personal[id] = card.name
  }

  personal.hp += heal
  personal.emit('effectTrigger', rlt)
  personal._foe.emit('effectTrigger', {card: genFoeRlt(rlt.card)})
  return {}
}

Game.prototype.modify = function(personal, effect) {
  let player = {personal: personal, opponent: personal._foe}
  let rlt = { attr: { personal: {}, opponent: {} } }
  for (let target in effect) {
    for (let object in effect[target]) {
      player[target][object] += effect[target][object]
      rlt.attr[target][object] = effect[target][object]
    }
  }
  personal.emit('effectTrigger', rlt)
  personal._foe.emit('effectTrigger', genFoeRlt(rlt))
  return {}
}

Game.prototype.receive = function (personal, param) {
  let room = this.room[personal._rid]
  let dmg_taken = (param.id === 'attack')? ((personal._foe.atk_damage < 0)? 0 : personal._foe.atk_damage) : (personal.dmg_blk[0])
  let card_pick = Object.keys(param.card_pick)
  let rlt = { card: {receive: {personal: {}, opponent: {}}} }

  // err check
  if (card_pick.length != dmg_taken) return {err: 'error length of card pick'}
  for (let id of card_pick) {
    let card = room.cards[id]
    if (card == null) return {err: 'no card id'}
    if (card.curr_own !== personal._pid) return {err: 'please choose your card'}
    if (card.field !== 'life') return {err: 'can only choose life field card'}
    if (!card.cover) return {err: 'cant pick card is unveiled'}
  }

  // change attr
  for (let id of card_pick) {
    let card = room.cards[id]
    card.cover = false
    rlt.card.receive.personal[id] = card.name
  }

  personal.dmg_blk.shift()
  personal.hp -= dmg_taken
  personal.emit('effectTrigger', rlt)
  personal._foe.emit('effectTrigger', {card: genFoeRlt(rlt.card)})

  return {}
}

Game.prototype.retrieve = function (personal, param) {
  let room = this.room[personal._rid]
  let effect = Object.assign({}, game.default.all_card[param.name].effect[param.tp][param.eff][param.tg])

  let card_pick = Object.keys(param.card_pick)
  let total_len = 0
  for (let type in effect) {
	if (type[0] == '_') continue
    total_len += effect[type]
  }
  if (card_pick.length != total_len) return {err: 'error retrieve length'}

  for (let id in param.card_pick) {
    let card = room.cards[id]
    if (card == null) return {err: 'no card id'}
    if (card.curr_own !== personal._pid) return {err: 'please choose personal card'}

    if (card.field !== 'deck') return {err: 'error card field'}
    if (!('card' in effect) && !(card.type.base in effect)) return {err: 'error card type'}
    if (!effect[('card' in effect)? 'card': card.type.base]) return {err: 'error type length'}
    effect[('card' in effect)? 'card' : card.type.base] --
    //param.card_pick[id] = {to: 'hand'}
	param.card_pick[id] = {to: effect._to}
  }

  let rlt = this.cardMove(personal, param.card_pick)

  personal.emit('effectTrigger', {card: {retrieve: { personal: rlt.personal, opponent: {} }}})
  personal._foe.emit('effectTrigger', {card: {retrieve: { personal: {}, opponent: rlt.opponent }}})
  return {}
}

Game.prototype.recall = function (personal, param) {
  let room = this.room[personal._rid]
  let effect = Object.assign({}, game.default.all_card[param.name].effect[param.tp][param.eff][param.tg])

  let card_pick = Object.keys(param.card_pick)
  let total_len = 0
  for (let type in effect) {
	if (type[0] == '_') continue
    total_len += effect[type]
  }
  if (card_pick.length != total_len) return {err: 'error recall length'}

  for (let id in param.card_pick) {
    let card = room.cards[id]
    if (card == null) return {err: 'no card id'}
    if (card.curr_own !== personal._pid) return {err: 'please choose personal card'}

    if (card.field !== 'grave') return {err: 'error card field'}
    if (!('card' in effect) && !(card.type.base in effect)) return {err: 'error card type'}
    if (!effect[('card' in effect)? 'card': card.type.base]) return {err: 'error type length'}
    effect[('card' in effect)? 'card' : card.type.base] --
    param.card_pick[id] = {to: effect._to}
  }

  let rlt = this.cardMove(personal, param.card_pick)

  personal.emit('effectTrigger', {card: {recall: { personal: rlt.personal, opponent: {} }}})
  personal._foe.emit('effectTrigger', {card: {recall: { personal: {}, opponent: rlt.opponent }}})
  return {}
}

Game.prototype.set = function (personal, effect) {
  let player = {personal: personal, opponent: personal._foe}
  let rlt = { attr: { personal: {}, opponent: {} } }
  for (let target in effect) {
    for (let object in effect[target]) {
      for (let src in effect[target][object]) {
        let val = 0
        if (src === 'value') val = effect[target][object][src]
        if (src === 'card_amount') val = player[target][src][effect[target][object][src]]
        player[target][object] = val
        rlt.attr[target][object] = val
      }
    }
  }
  personal.emit('effectTrigger', rlt)
  personal._foe.emit('effectTrigger', genFoeRlt(rlt))
  return {}
}

Game.prototype.steal = function (personal, param) {
  let room = this.room[personal._rid]
  let effect = Object.assign({}, game.default.all_card[param.name].effect[param.tp][param.eff][param.tg])

  let card_pick = Object.keys(param.card_pick)
  let total_len = 0
  for (let tp in effect) {
    total_len += effect[tp]
  }
  if (card_pick.length != total_len) return {err: 'error steal length'}

  for (let id in param.card_pick) {
    let card = room.cards[id]
    if (card == null) return {err: 'no card id'}
    if (card.curr_own !== personal._foe._pid) return {err: 'please choose opponent card'}
    if (card.field !== 'hand') return {err: 'please choose hand card'}
    if (!('card' in effect) && !(card.type.base in effect)) return {err: 'error card type'}
    if (!effect[('card' in effect)? 'card' : card.type.base]) return {err: 'error type length'}
    effect[('card' in effect)? 'card' : card.type.base] --
    //param.card_pick[id] = {new_own: 'opponent', to: 'hand'}
	param.card_pick[id] = {new_own: 'personal', to: 'hand'}
  }

  //let rlt = this.cardMove(personal._foe, param.card_pick)
  let rlt = this.cardMove(personal, param.card_pick)
  
  //personal.emit('effectTrigger', {card: {steal: { personal: rlt.opponent, opponent: {} }}})
  //personal._foe.emit('effectTrigger', {card: {steal: { personal: {}, opponent: rlt.personal }}})
  personal.emit('effectTrigger', {card: {steal: { personal: rlt.personal, opponent: {} }}})
  personal._foe.emit('effectTrigger', {card: {steal: { personal: {}, opponent: rlt.opponent }}})
  
  return {}
}


/////////////////////////////////////////////////////////////////////////////////

// utility
function operation (curr_val, condition) {
  let operator = Object.keys(condition)[0]
  switch (operator) {
    case 'more':
      return (curr_val > condition[operator])? true : false
    case 'goe':
      return (curr_val >= condition[operator])? true : false
    case 'less':
      return (curr_val < condition[operator])? true : false
    case 'loe':
      return (curr_val <= condition[operator])? true : false
    case 'eql':
      return (curr_val == condition[operator])? true : false

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

function genFoeRlt (param) {
  for (let type in param) {
    let temp = param[type].personal
    param[type].personal = param[type].opponent
    param[type].opponent = temp
  }
  return param
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
    for (let type in card)
      if (game.default.all_card[card_name].type.base === type) {
        card[type].push(card_name)
        break
      }
  }

  for(let type in card){
    if(type !== 'vanish'){
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
    if(client._rid){
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
      game.buildPlayer(player)
      game.pool[pid] = player
      console.log(`reset player ${pid}`)
      delete player._rid
    }
    delete game.room[rid]
    return
  })

  client.on('matchEnd', cb => {
    if (!client.hp || !client._foe.hp) {
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
      if(!rlt.length) return cb({err: 'no such user exists'})
      if(rlt[0].passwd !== it.passwd) return cb({err: 'wrong password'})

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

    if(!it.curr_deck) return cb({err: 'please choose a deck'})
    user.find({account: client._account}).toArray((err, rlt) => {
      if (!rlt[0].deck_slot[it.curr_deck] && it.curr_deck !== 'random') return

      // build deck

      // player can choose random deck
      deck = shuffle((it.curr_deck === 'random')? randomDeck() : (rlt[0].deck_slot[it.curr_deck].card_list) )
      client.choose_deck[it.curr_deck] = deck

      for(let card_name of deck){
        let curr_card = game.default.all_card[card_name]
        let init = {
          name: curr_card.name,
          type: curr_card.type,
          field: 'deck',
          owner: client._pid
        }
        client.curr_deck.push(new Card(init))
        client.card_amount.deck += 1
      }

      // find opponent
      if(game.queue.length){
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
        for (let pid in room.player) {
          for (let [index, card] of room.player[pid].curr_deck.entries()) {
            let id = `card_${game.room[rid].card_id}`
			card.id = id
            room.cards[id] = card
            if (index < room.player[pid].life_max) {
              card.field = 'life'
              life[pid].personal.push({id: id, name: card.name})
              life[room.player[pid]._foe._pid].opponent.push({id: id})
              room.player[pid].card_amount.deck -= 1
              room.player[pid].card_amount.life += 1
            }
            else record_deck[pid].push({id: id, name: card.name})
            room.card_id ++
          }
        }
        cb({})

        // game start
        opponent.emit('gameStart', {card_list: {life: life[opponent._pid], deck: record_deck[opponent._pid]}, msg: {phase: 'normal phase', action: 'your turn', cursor: ' '}, start: true })
        client.emit('gameStart', {card_list: {life: life[client._pid], deck: record_deck[client._pid]}, msg: {phase: 'normal phase', action: 'opponent turn', cursor: ' '}, start: false })
      }
      else{
        game.queue.push(client)
        delete game.pool[client._pid]
        cb({msg: {cursor: 'searching for match...'}})
      }
    })
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

    room.phase = 'attack'
    room.atk_status.attacker = client
    room.atk_status.defender = client._foe
    room.atk_status.curr = room.atk_status.defender
    client.action_point -= 1
    client.atk_phase -= 1

    if ((Object.keys(client.aura.triumph).length && client.card_amount.battle >= 3) || Object.keys(client.aura.precise).length || client.buff.eagle_eye) {
      game.buff(client, {eagle_eye: {personal: false}})
      room.atk_status.hit = true
	  game.buildEffectQueue(client, client.atk_enchant)
      //let avail_effect = game.judge(client, client._foe, {enchant: client.atk_enchant})
      //game.effectTrigger(client, client._foe, avail_effect)
    }
    else {
      client._foe.first_conceal = true
      client.emit('playerAttack', { msg: {phase: 'attack phase', action: 'attack... waiting opponent'}, rlt: {personal: true, attack: true} })
      client._foe.emit('playerAttack', { msg: {phase: 'attack phase', action: 'foe attack'}, rlt: {opponent: true, attack: true} })
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
    let action = (it.conceal)? 'conceal' : 'tracking'

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

    client.emit(`plyUseVanish`, { msg: {action: `${action}... waiting opponent`}, card: rlt.personal, rlt: Object.assign({personal: true}, panel) })
    client._foe.emit(`plyUseVanish`, { msg: {action: `foe ${action}`}, card: rlt.opponent, rlt: Object.assign({opponent: true}, panel) })
    
	game.drain(personal, {card_pick: personal.aura.decay}, use_vanish = true)
    room.atk_status.curr = (client == room.atk_status.attacker)? (room.atk_status.defender) : (room.atk_status.attacker)
  })

  client.on('giveUp', () => {
    let room = game.room[client._rid]

    if (room.phase !== 'attack') return

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
          //let avail_effect = game.judge(client._foe, client, param)
          //game.effectTrigger(client._foe, client, avail_effect)
        }
        else {
          room.phase = 'normal'
          if (card.type.effect.chanting) {
			client._foe.chanting[card.id] = {to: 'grave'}
		  }
		  if ('counter' in card) {
			/*
			let eff_tp = Object.keys(card.counter)[0]
			let target = Object.keys(card.counter[eff_tp])[0]
			client._foe.anti[target][card.id] = true
			console.log(`counter in ${card.name}`)
			*/
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
            //let avail_effect = game.judge(client._foe, client, Object.assign({trigger: room.counter_status.use_id}, {counter: room.counter_status.counter_id}) )
            //game.effectTrigger(client._foe, client, avail_effect)
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
      client.emit('plyDrawCard', {msg: {action: `draw ${card.name}`}, card: rlt.personal})
      client._foe.emit('plyDrawCard', {msg: {action: 'foe draw card'}, card: rlt.opponent})

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

    let type = ((card.field === 'battle' && !('counter' in game.default.all_card[card.name].effect)) || card.field === 'altar')? 'trigger' : 'use'
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
    if (client.card_amount.hand > client.hand_max) {
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
          break

        default: break
      }
    }
    let rlt = {personal: {}, opponent: {}}
    if (Object.keys(param).length) rlt = game.cardMove(client, param)

    let act_msg = (room.curr_ply === client._pid)? ['your', 'opponent'] : (['opponent', 'your'])
    client.emit('turnShift', { msg: {phase: 'normal phase', action: `${act_msg[0]} turn`, cursor: ' '}, card: rlt.personal, start: (act_msg[0] == 'your')? true : false })
    client._foe.emit('turnShift', { msg: {phase: 'normal phase', action: `${act_msg[1]} turn`, cursor: ' '}, card: rlt.opponent, start: (act_msg[1] == 'your')? true : false })

    // !-- start next player turn
    // attr check
    let nxt_ply = (room.curr_ply === client._pid)? client : (client._foe)
    //if (nxt_ply.stat.stun) nxt_ply.action_point -= 1

    // chanting spell trigger
    if (!nxt_ply.stat.stun && Object.keys(nxt_ply.chanting).length) {
      // card move
      rlt = game.cardMove(nxt_ply, nxt_ply.chanting)
      nxt_ply.emit('chantingTrigger', {card: rlt.personal})
      nxt_ply._foe.emit('chantingTrigger', {card: rlt.opponent})
      // effect
	  game.buildEffectQueue(nxt_ply, {chanting: nxt_ply.chanting})
      //let avail_effect = game.judge(nxt_ply, nxt_ply._foe, {chanting: nxt_ply.chanting})
      //game.effectTrigger(nxt_ply, nxt_ply._foe, avail_effect)
    }
	nxt_ply.chanting = {}
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
    if (!game[effect]) return {err: true}
    // if eff_id is not in client.eff_todo return
    if (!client.eff_todo[it.id]) return {err: true}

    if (!client.eff_todo[it.id][it.tp]) return {err: true}
    // if it.eff doesn't exist in client.eff_todo.your_id return
    if (!client.eff_todo[it.id][it.tp][it.eff]) return {err: true}

    let rlt = game[effect](client, it)
    if (rlt.err) return cb(rlt)
    else {
      if (!client.hp) {
        client.emit('gameOver', {msg: {end: 'You LOSE\nclick anywhere else to leave'}})
        client._foe.emit('gameOver', {msg: {end: 'You WIN\nclick anywhere else to leave'}})
        client._foe.hp = 0
        return
      }
      else cb({})
    }

    delete client.eff_todo[it.id][it.tp][it.eff]
    if (!Object.keys(client.eff_todo[it.id][it.tp]).length) delete client.eff_todo[it.id][it.tp]
    if (!Object.keys(client.eff_todo[it.id]).length) delete client.eff_todo[it.id]

    if (!Object.keys(client.eff_todo).length && !Object.keys(client._foe.eff_todo).length) {
	  if (room.effect_queue.length) {
		game.effectEmitter(room)  
	  }	
	  else {	
        if (it.decision && room.phase === 'attack') game.attackEnd(room)
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

server.listen(opt.serv_port, function(){
  console.log(`listen on port ${opt.serv_port}`)
})

