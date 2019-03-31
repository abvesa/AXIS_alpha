
function genFoeRlt (param) {
  let rlt = {}
  for (let type in param) {
	rlt[type] = {personal: param[type].opponent, opponent: param[type].personal}  
  }
  return rlt
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

module.exports = {
  bleed : function (personal, param) {
	  let room = this.room[personal._rid]
	  let effect = this.default.all_card[param.name].effect[param.tp][param.eff]
	  let card_pick = Object.keys(param.card_pick)
	  let rlt = { card: {bleed: {personal: {}, opponent: {}}}}
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
	  
	  return {
		eff: {
		  personal: Object.assign(rlt, {attr: {personal: {hp: personal.hp}, opponent: {hp: personal._foe.hp}}}),
		  opponent: {card: genFoeRlt(rlt.card), attr: {opponent: {hp: personal.hp}, personal: {hp: personal._foe.hp}}}
		}
	  }
  },
  block : function (personal, param) {
	  let room = this.room[personal._rid]
	  let card_pick = Object.keys(param.card_pick)
	  // if block only under trigger type effect

	  if (card_pick.length != 1) return {err: 'can only choose one card'}
	  for (let id of card_pick) {
		let card = room.cards[id]
		if (card == null) return {err: 'no card id'}
		if (card.curr_own !== personal._pid) return {err: 'please choose your card'}
		if (card.field === 'life' || card.field === 'hand') return {err: 'can only choose battle, altar, socket card'}
		let eff = this.default.all_card[card.name].effect
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
		  tmp = this.cardMove(personal, param)
		}
		if (card.type.base === 'artifact') {
		  card.overheat = true
		  card.energy -= 1
		  tmp.personal[id] = {turn_dn: true}
		  tmp.opponent = tmp.personal
		}
		personal.dmg_blk.shift()
	  }

	  //personal.emit('effectTrigger', {card:{block:{ personal: tmp.personal, opponent: {} }}})
	  //personal._foe.emit('effectTrigger', {card:{block:{ personal: {}, opponent: tmp.opponent }}})
	  return {
		eff: {
		  personal: {card:{block:{ personal: tmp.personal, opponent: {} }}}, 
		  opponent:	{card:{block:{ personal: {}, opponent: tmp.opponent }}}	
		}    
	  }
  },
  aura : function (personal, card_list) { // card_list = {cid: true, ...}
	  let player = {personal: personal, opponent: personal._foe}
	  let rlt = { stat: {personal: {}, opponent: {}} }
	  let card_flip = {personal: {}, opponent: {}}

	  let room = this.room[personal._rid]
	  
	  for (let cid in card_list) {
		let eff = this.default.all_card[room.cards[cid].name].aura
		for (let tp in eff) {
		  for (let tg in eff[tp]) {
			//if (tp === 'unveil') {
			//if (tp === 'unveil' && card_list[cid] && !player[tg].aura[tp][cid]) {
			if (tp === 'unveil' && ((card_list[cid] && !Object.keys(player[tg].aura[tp]).length) || (!card_list[cid] && Object.keys(player[tg].aura[tp]).length == 1 && cid in player[tg].aura[tp]))) {
			  let cover = (card_list[cid])? false : true
	  
			  let tmp = Object.keys(room.cards).reduce( (last, curr) => {
				if (room.cards[curr].curr_own === player[tg]._pid && room.cards[curr].field === 'hand')
				  last[curr] = room.cards[curr].name
				return last
			  }, {})
			  
			  Object.assign(card_flip[tg], tmp)
			}  
			  
			if (card_list[cid] == true) {
			  player[tg].aura[tp][cid] = true
			  rlt.stat[tg][tp] = true
			}
			else {
			  delete player[tg].aura[tp][cid]
			  if (!Object.keys(player[tg].aura[tp]).length) rlt.stat[tg][tp] = false
			}		
		  }
		}
	  }
	  
	  let personal_rlt = (Object.keys(card_flip.opponent).length)? Object.assign({}, rlt, {card: {unveil: card_flip.opponent}}) : rlt
	  personal.emit('effectTrigger', personal_rlt)
	  
	  let opponent_rlt = (Object.keys(card_flip.personal).length)? Object.assign({}, genFoeRlt(rlt), {card: {unveil: card_flip.personal}}) : genFoeRlt(rlt)
	  personal._foe.emit('effectTrigger', opponent_rlt)

	  return {}
	  /*
		eff: {
		  personal: personal_rlt,
		  opponent: opponent_rlt
		}    
	  }
	  */
  },
  buff : function (personal, effect, info = {}) {
	  let player = {personal: personal, opponent: personal._foe}
	  let rlt = { stat: {personal: {}, opponent: {}} }
	  for (let name in effect) {
		for (let target in effect[name]) {	  
		  player[target].buff[name] = effect[name][target]
		  rlt.stat[target][name] = effect[name][target]
		}
	  }
	  //personal.emit('effectTrigger', rlt)
	  //personal._foe.emit('effectTrigger', genFoeRlt(rlt))
	  return {
		eff: {
		  personal: rlt,
		  opponent: genFoeRlt(rlt)
		}  
	  }
  },
  stat : function (personal, effect, info = {}) {
	  let player = {personal: personal, opponent: personal._foe}
	  let rlt = { stat: {personal: {}, opponent: {}} }

	  for (let name in effect) {
		for (let target in effect[name]) {
		  let tp = (name === 'all')? Object.keys(player[target].stat) : [name]
		  for (let stat_name of tp) {
			player[target].stat[stat_name] = effect[name][target]
			rlt.stat[target][stat_name] = effect[name][target]
			
			// recover chanting after recover stun
			if (stat_name === 'stun') {
			  let chanting_mod = (effect[name][target] == true)? false : true
			  let avail_chanting = Object.keys(player[target].chanting).reduce( (last, curr) => {
				if (player[target].chanting[curr].status != chanting_mod) {
				  player[target].chanting[curr].status = chanting_mod
				  if (chanting_mod) {
					last[curr] = player[target].chanting[curr]
					delete player[target].chanting[curr]
				  }
				}
				return last
			  }, {})
			  if (Object.keys(avail_chanting).length) {
				let rtn = this.cardMove(player[target], avail_chanting)
				player[target].emit('chantingTrigger', {card: rtn.personal})
				player[target]._foe.emit('chantingTrigger', {card: rtn.opponent})
				this.buildEffectQueue(player[target], {chanting: avail_chanting})
			  }
			}
			//
		  }
		}
	  }
	  //personal.emit('effectTrigger', rlt)
	  //personal._foe.emit('effectTrigger', genFoeRlt(rlt))
	  return {
		eff: {
		  personal: rlt,
		  opponent: genFoeRlt(rlt)
		}    
	  }
  },
  control : function (personal, param) {
	  let room = this.room[personal._rid]
	  let effect = this.default.all_card[param.name].effect[param.tp][param.eff]
	  let card_pick = Object.keys(param.card_pick)
	  let rlt = {}

	  if (card_pick.length != 1) return {err: 'can only choose one card'}
	  for (let id of card_pick) {
		let card = room.cards[id]
		if (card == null) return {err: 'no card id'}
		if (card.curr_own !== personal._foe._pid) return {err: 'please choose opponent card'}
		if (!effect.personal[card.field]) return {err: 'wrong type of chosen card field'}
		if (!effect.personal[card.field][card.type.base]) return {err: 'wrong type of chosen card type'}
		if (card.field === 'battle') {
		  if (card.checkCrossProtection()) continue
		}

		let param = {}
		param[id] = {from: card.field, to: card.field, new_own: 'personal'}
		rlt = this.cardMove(personal, param)
	  }

	  //personal.emit('effectTrigger', {card:{control:{ personal: rlt.personal, opponent: {} }}})
	  //personal._foe.emit('effectTrigger', {card:{control:{ personal: {}, opponent: rlt.opponent }}})
	  return {
		eff: {
		  personal: {card:{control:{ personal: rlt.personal, opponent: {} }}},	
		  opponent: {card:{control:{ personal: {}, opponent: rlt.opponent }}}
		}  
	  }
  },
  // break = choose card to send to grave
  break :  function (personal, param) {
	  let room = this.room[personal._rid]
	  let effect = Object.assign({}, this.default.all_card[param.name].effect[param.tp][param.eff][param.tg])
	  
	  let card_pick = Object.keys(param.card_pick)
	  let total_len = 0
	  for (let tp in effect) {
		total_len += effect[tp]
	  }
	  if (card_pick.length != total_len) return {err: 'error break length'}

	  let player = {personal: personal, opponent: personal._foe}
	  for (let id of card_pick) {
		let card = room.cards[id]
		let curr_own = (card.curr_own === personal._pid)? 'personal' : 'opponent'
		if (card == null) return {err: 'no card id'}
		if (curr_own !== 'opponent') return {err: 'please choose opponent card'}
		if (card.field !== 'battle' && card.field !== 'altar') return {err: 'error chosen card field'}
		if (!('card' in effect) && !(card.type.base in effect)) return {err: 'error card type'}
		if (!effect[('card' in effect)? 'card' : card.type.base]) return {err: 'error type length'}
		effect[('card' in effect)? 'card' : card.type.base] --
		//param.card_pick[id] = {new_own: 'personal', to: 'grave'}
		if (card.field === 'battle') {
		  if (card.checkCrossProtection()) {
			delete param.card_pick[id]
			continue
		  }
		}	
		param.card_pick[id] = {to: 'grave'}
		if (id in player[curr_own].chanting) delete player[curr_own].chanting[id]
	  }

	  let rlt = this.cardMove(personal, param.card_pick)

	  //personal.emit('effectTrigger', {card: {break: { personal: rlt.personal, opponent: {} }}})
	  //personal._foe.emit('effectTrigger', {card: {break: { personal: {}, opponent: rlt.opponent }}})
	  
	  return {
		eff: {
		  personal: {card: {break: { personal: rlt.personal, opponent: {} }}},
		  opponent: {card: {break: { personal: {}, opponent: rlt.opponent }}}	  
		}  
	  }
  },
  // destroy = send all cards in specific field to grave
  destroy : function (personal, effect, info = {}) {
	  let room = this.room[personal._rid]
	  let player = {personal: personal, opponent: personal._foe}
	  let mod_eff = Object.assign({}, effect)
	  let rlt = {}

	  let tmp = {personal: {}, opponent: {}}
	  for (let id in room.cards) {
		let card = room.cards[id]
		let curr_own = (card.curr_own === personal._pid)? 'personal' : 'opponent'
		if (!(curr_own in mod_eff)) continue
		if (!(card.field in mod_eff[curr_own])) continue
		if (card.field === 'battle') {
		  if (card.checkCrossProtection()) continue
		}
		tmp[curr_own][id] = {from: card.field, to: 'grave'}
		if (card.field === 'socket') tmp[curr_own][id].off = card.bond
		if (id in player[curr_own].chanting) delete player[curr_own].chanting[id]
	  }
	  
	  /* origin destroy, able to destroy two player's field in one effect
	  for (let tg in mod_eff) {
		if (!Object.keys(mod_eff[tg]).length) continue
		rlt = this.cardMove(player[tg], tmp[tg])
		player[tg].emit('effectTrigger', {card: {destroy: { personal: rlt.personal, opponent: {} }}})
		player[tg]._foe.emit('effectTrigger', {card: {destroy: { personal: {}, opponent: rlt.opponent }}})
	  }
	  */
	  
	  rlt = this.cardMove(personal, tmp.personal)
	  //personal.emit('effectTrigger', {card: {destroy: { personal: rlt.personal, opponent: {} }}})
	  //personal._foe.emit('effectTrigger', {card: {destroy: { personal: {}, opponent: rlt.opponent }}})
	  
	  return {
		eff: {
		  personal: {card: {destroy: { personal: rlt.personal, opponent: {} }}},
		  opponent: {card: {destroy: { personal: {}, opponent: rlt.opponent }}}
		}  
	  }
  },
  discard: function (personal, param) {
	  let room = this.room[personal._rid]
	  let effect = (room.phase === 'end')
				   ? {card: personal.card_amount.hand - (((Object.keys(personal.aura.stamina).length)? 1 : 0)*2) - personal.hand_max}
				   : Object.assign({}, this.default.all_card[param.name].effect[param.tp][param.eff][param.tg])
	  
				   
	  let card_pick = Object.keys(param.card_pick)
	  let total_len = 0
	  for (let tp in effect) {
		total_len += effect[tp]
	  }
	  if ((card_pick.length < total_len && card_pick.length != personal.card_amount.hand) || (card_pick.length > total_len)) return {err: 'error discard length'}

	  for (let id in param.card_pick) {
		let card = room.cards[id]
		if (card == null) return {err: 'no card id'}
		if (card.curr_own !== personal._pid) return {err: 'please choose your card'}
		if (card.field !== 'hand') return {err: 'please choose hand card'}
		if (!(card.name in effect) && !('card' in effect) && !(card.type.base in effect)) return {err: 'error card type'}	
		if (!effect[(card.name in effect)? card.name : ((card.type.base in effect)? card.type.base : 'card')]) return {err: 'error type length'}
		effect[(card.name in effect)? card.name : ((card.type.base in effect)? card.type.base : 'card')] --
	  }

	  let rlt = this.cardMove(personal, param.card_pick)
	  //personal.emit('effectTrigger', {card: {discard: { personal: rlt.personal, opponent: {} }}})
	  //personal._foe.emit('effectTrigger', {card: {discard: { personal: {}, opponent: rlt.opponent }}})
	  return {
		eff: {
		  personal: {card: {discard: { personal: rlt.personal, opponent: {} }}},
		  opponent: {card: {discard: { personal: {}, opponent: rlt.opponent }}}
		}  	  
	  }
  },
  discardOrDrain : function (personal, param) {
	let room = this.room[personal._rid]
	//let effect = Object.assign({}, this.default.all_card[param.name].effect[param.tp][param.eff][param.tg])
	let card_pick = Object.keys(param.card_pick)
	let new_param = Object.assign({}, param)
    
	if (card_pick.length > 1) return {err: 'only need to discard 1 card'}
	else if (card_pick.length == 1) {	  
	  new_param.tp = 'aura'
	  new_param.eff = 'discard'
	  new_param.tg = 'personal'
	  this.discard(personal, new_param)		
	}
	else if (card_pick.length == 0) {
      new_param.card_pick = {[new_param.id]: true}
      this.drain(personal, new_param, use_vanish=true)	  
	}
	
	return {}
  },
  repair : function (personal, param) {
	  let room = this.room[personal._rid]
	  let player = {personal: personal, opponent: personal._foe}
	  let rlt = {personal: {}, opponent: {}}

	  let effect = Object.assign({}, this.default.all_card[param.name].effect[param.tp][param.eff][param.tg])
	  let card_pick = Object.keys(param.card_pick)
	  let total_len = 0
	  
	  for (let type in effect) {
		if (type === '_target') continue
		total_len += effect[type]
	  }
	  if (card_pick.length != total_len) return {err: 'error repair length'}
	  
	  for (let id in param.card_pick) {
		let card = room.cards[id]
		let card_owner = (card.curr_own === personal._pid)? 'personal' : 'opponent'
		if (card == null) return {err: 'no card id'}
		if (card.field !== 'battle') return {err: 'please choose card on battle field'}
		if (!effect._target.includes(card_owner)) return {err: 'error card owner'}
		if (!effect.artifact) return {err: 'error card length'}
		effect.artifact --
	  }
	  
	  let aura_modify = {personal: {}, opponent: {}}
	  for (let id in param.card_pick) {
		let card = room.cards[id]
		if (card.energy > 1) continue
		let card_owner = (card.curr_own === personal._pid)? 'personal' : 'opponent'
		if (card.energy == 0 && this.default.all_card[card.name].aura) aura_modify[card_owner][card.id] = true
		card.energy += 1
		rlt[card_owner][id] = {turn: 'up'}
	  }	
	  
	  //personal.emit('effectTrigger', {card: {repair: { personal: rlt.personal, opponent: rlt.opponent }}})
	  //personal._foe.emit('effectTrigger', {card: {repair: { personal: rlt.opponent, opponent: rlt.personal }}})
	  
	  if (Object.keys(aura_modify.personal)) this.aura(personal, aura_modify.personal)
	  if (Object.keys(aura_modify.opponent)) this.aura(personal._foe, aura_modify.opponent)
	  
	  return {
		eff: {
		  personal: {card: {repair: { personal: rlt.personal, opponent: rlt.opponent }}},
		  opponent: {card: {repair: { personal: rlt.opponent, opponent: rlt.personal }}}
		}  	  
	  }
  },
  repairAll : function (personal, effect, info = {}) {
	  let room = this.room[personal._rid]
	  let player = {personal: personal, opponent: personal._foe}
	  let mod_eff = Object.assign({}, effect)
	  let rlt = {personal: {}, opponent: {}}
	  
	  let aura_modify = {personal: {}, opponent: {}}
	  for (let id in room.cards) {
		if (info.name === 'entrance' && id === info.id) continue
		let card = room.cards[id]
		if (card.field !== 'battle') continue
		let card_owner = (card.curr_own === personal._pid)? 'personal' : 'opponent'
		if (!(card_owner in mod_eff)) continue    
		if (card.energy > 1) continue
		
		if (card.energy == 0 && this.default.all_card[card.name].aura) aura_modify[card_owner][card.id] = true
		card.energy += 1
		rlt[card_owner][id] = {turn: 'up'}
	  }

	  //personal.emit('effectTrigger', {card: {repair: { personal: rlt.personal, opponent: rlt.opponent }}})
	  //personal._foe.emit('effectTrigger', {card: {repair: { personal: rlt.opponent, opponent: rlt.personal }}})
	  
	  if (Object.keys(aura_modify.personal)) this.aura(personal, aura_modify.personal)
	  if (Object.keys(aura_modify.opponent)) this.aura(personal._foe, aura_modify.opponent)
	  
	  return {
		eff: {
		  personal: {card: {repair: { personal: rlt.personal, opponent: rlt.opponent }}},
		  opponent:  {card: {repair: { personal: rlt.opponent, opponent: rlt.personal }}}
		}  	  
	  }
  },
  drain : function (personal, param, use_vanish = false) {
	  let room = this.room[personal._rid]
	  let player = {personal: personal, opponent: personal._foe}
	  let rlt = {personal: {}, opponent: {}}
	  
	  if (!use_vanish) {
		let effect = Object.assign({}, this.default.all_card[param.name].effect[param.tp][param.eff][param.tg])
		let card_pick = Object.keys(param.card_pick)
		let total_len = 0
	  
		for (let type in effect) {
		  if (type === '_target') continue
		  total_len += effect[type]
		}
		if (card_pick.length != total_len) return {err: 'error drain length'}
	  
		for (let id in param.card_pick) {
		  let card = room.cards[id]
		  let card_owner = (card.curr_own === personal._pid)? 'personal' : 'opponent'
		  if (card == null) return {err: 'no card id'}
		  if (card.field !== 'battle') return {err: 'please choose card on battle field'}
		  if (!effect._target.includes(card_owner)) return {err: 'error card owner'}
		  if (Object.keys(player[card_owner].aura.fortify).length) delete param.card_pick[id]
		  if (!effect.artifact) return {err: 'error card length'}
		  effect.artifact --
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
		if (card_owner === 'opponent' && card.field === 'battle') {
		  if (card.checkCrossProtection()) continue
		}
		
		card.energy -= 1
		if (use_vanish) card.overheat = true
		
		if (card.energy == 0 && this.default.all_card[card.name].aura) aura_modify[card_owner][card.id] = false
		rlt[card_owner][id] = {turn: 'down'}
	  }	
	  
	  //personal.emit('effectTrigger', {card: {drain: { personal: rlt.personal, opponent: rlt.opponent }}})
	  //personal._foe.emit('effectTrigger', {card: {drain: { personal: rlt.opponent, opponent: rlt.personal }}})
	  
	  if (Object.keys(aura_modify.personal)) this.aura(personal, aura_modify.personal)
	  if (Object.keys(aura_modify.opponent)) this.aura(personal._foe, aura_modify.opponent)
	  
	  return {
		eff: {
		  personal: {card: {drain: { personal: rlt.personal, opponent: rlt.opponent }}},
		  opponent: {card: {drain: { personal: rlt.opponent, opponent: rlt.personal }}}
		}  	  
	  }
  },
  drainAll : function (personal, effect, info = {}) {
	  let room = this.room[personal._rid]
	  let player = {personal: personal, opponent: personal._foe}
	  let mod_eff = Object.assign({}, effect)
	  let rlt = {personal: {}, opponent: {}}
	  
	  let aura_modify = {personal: {}, opponent: {}}
	  for (let id in room.cards) {
		let card = room.cards[id]
		if (card.field !== 'battle') continue
		let card_owner = (card.curr_own === personal._pid)? 'personal' : 'opponent'
		if (!(card_owner in mod_eff)) continue
		if (card.field === 'battle') {
		  if (card.checkCrossProtection()) continue
		}		
		if (card.energy < 1) continue
		
		card.energy -= 1
		if (card.energy == 0 && this.default.all_card[card.name].aura) aura_modify[card_owner][card.id] = false
		rlt[card_owner][id] = {turn: 'down'}
	  }

	  //personal.emit('effectTrigger', {card: {drain: { personal: rlt.personal, opponent: rlt.opponent }}})
	  //personal._foe.emit('effectTrigger', {card: {drain: { personal: rlt.opponent, opponent: rlt.personal }}})
	  
	  if (Object.keys(aura_modify.personal)) this.aura(personal, aura_modify.personal)
	  if (Object.keys(aura_modify.opponent)) this.aura(personal._foe, aura_modify.opponent)
	  
	  return {
		eff: {
		  personal: {card: {drain: { personal: rlt.personal, opponent: rlt.opponent }}},
		  opponent: {card: {drain: { personal: rlt.opponent, opponent: rlt.personal }}}
		}   
	  }
  },
  draw : function (personal, effect, info = {}) {
	  let room = this.room[personal._rid]
	  let player = {personal: personal, opponent: personal._foe}
	  let rlt = {personal: {}, opponent: {}}

	  //console.log(effect)
	  
	  for (let target in effect) {
		for (let object in effect[target]) {
		  let val = effect[target][object]
		  let tmp = {}
		  for (let id in room.cards) {
			let card = room.cards[id]
			if (card.field === 'deck' && card.curr_own === player[target]._pid && ((object === 'card')? true : (card.type.base === object)) ) {
			  tmp[id] = {to: 'hand'}
			  val --
			}
			if (!val || (val && (val == effect[target][object] - player[target].card_amount.deck)) ) break
		  }
		  let rtn = this.cardMove(player[target], tmp)
		  Object.assign(rlt[target], rtn.personal)
		  Object.assign(rlt[(target === 'personal')? 'opponent' : 'personal'], rtn.opponent)
		}
	  }

	  //personal.emit('effectTrigger', {card: {draw: {personal: rlt.personal, opponent: {} } } })
	  //personal._foe.emit('effectTrigger', {card: {draw: {opponent: rlt.opponent, personal: {} } } })

	  return {
		eff: {
		  personal: {card: {draw: {personal: rlt.personal, opponent: {} }}},
		  opponent: {card: {draw: {opponent: rlt.opponent, personal: {} }}}
		}  
	  }
  },
  equip : function(personal, param) {
	  // check artifact aura
	  let effect = this.default.all_card[param.name].effect[param.tp][param.eff]
	  let rlt = { card: {} }
	  for (let target in effect) {
		for (let object in effect[target]) {
		  for (let type in effect[target][object]) {
			rlt.card['equip'] = {}
		  }
		}
	  }
	  //personal.emit('effectTrigger', rlt)
	  //personal._foe.emit('effectTrigger', rlt)
	  return {
		eff: {
		  personal: rlt,
		  opponent: rlt
		}  
	  }
  },
  heal : function (personal, param) {
	  let room = this.room[personal._rid]
	  let effect = this.default.all_card[param.name].effect[param.tp][param.eff]
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
	  //personal.emit('effectTrigger', Object.assign(rlt, {attr: {personal: {hp: personal.hp}, opponent: {hp: personal._foe.hp}}}))
	  //personal._foe.emit('effectTrigger', {card: genFoeRlt(rlt.card), attr: {opponent: {hp: personal.hp}, personal: {hp: personal._foe.hp}}})
	 
	  return {
		eff: {
		  personal: Object.assign(rlt, {attr: {personal: {hp: personal.hp}, opponent: {hp: personal._foe.hp}}}),
		  opponent:	{card: genFoeRlt(rlt.card), attr: {opponent: {hp: personal.hp}, personal: {hp: personal._foe.hp}}}
		}  
	  }
  },
  modify : function(personal, effect) {
	  let room = this.room[personal._rid] 
	  let player = {personal: personal, opponent: personal._foe}
	  let rlt = { attr: { personal: {}, opponent: {} } }
	  let card_move = {}
	  
	  for (let target in effect) {
		for (let object in effect[target]) {
		  player[target][object] += effect[target][object]
		  rlt.attr[target][object] = player[target][object]
		  
		  if (object === 'life_max' && player[target].card_amount.deck > 0) {
			let tmp = {}
			for (let id in room.cards) {
			  let card = room.cards[id]
			  if (card.field === 'deck' && card.curr_own === player[target]._pid) {
				tmp[id] = {to: 'life'}
				break
			  }
			}  
			card_move = this.cardMove(player[target], tmp)
		  }
		}
	  }
	  personal_rlt = (Object.keys(card_move).length)? Object.assign({}, rlt, {card: {modify: {personal: card_move.personal, opponent: {}}}}) : rlt  
	  //personal.emit('effectTrigger', personal_rlt)
	  
	  opponent_rlt = (Object.keys(card_move).length)? Object.assign({}, genFoeRlt(rlt), {card: {modify: {opponent: card_move.opponent, personal: {}}}}) : genFoeRlt(rlt)
	  //personal._foe.emit('effectTrigger', opponent_rlt)
	  return {
		eff: {
		  personal: personal_rlt,
		  opponent: opponent_rlt	  
		}  
	  }
  },
  shuffle : function (personal, effect, info = {}) {
	  let room = this.room[personal._rid] 
	  let player = {personal: personal, opponent: personal._foe}
	  
	  for (let target in effect) {	  
		if (player[target].card_amount.deck <= 1) continue 
		let deck_list = Object.keys(room.cards).reduce( (last, curr) => {
		  if (room.cards[curr].curr_own === player[target]._pid && room.cards[curr].field === 'deck')
			last.push(curr)
		  return last
		}, [])
		deck_list = shuffle(deck_list)
		for (let cid of deck_list) {
		  let tmp = room.cards[cid]
		  delete room.cards[cid]
		  room.cards[cid] = tmp		  
		}
	  }
	  
	  return {}
  },
  // the simple version of reuse, can't handle multitype cards
  // reuse is now only for spell type cards in grave
  reuse : function (personal, param) {
	  let room = this.room[personal._rid]
	  let effect = Object.assign({}, this.default.all_card[param.name].effect[param.tp][param.eff][param.tg])

	  let card_pick = Object.keys(param.card_pick)
	  let total_len = 0
	  for (let type in effect) {
		if (type[0] == '_') continue
		total_len += effect[type]
	  }
	  if (card_pick.length != total_len) return {err: 'error reuse length'}

	  // check
	  for (let id in param.card_pick) {
		let card = room.cards[id]
		if (card == null) return {err: 'no card id'}
		if (card.curr_own !== personal._pid) return {err: 'please choose personal card'}

		if (card.field !== 'grave') return {err: 'error card field'}
		if (!(card.type.base in effect)) return {err: 'error card type'}
		if (!effect[card.type.base]) return {err: 'error type length'}
		effect[card.type.base] --
	  }
	  
	  // push effect to effect_queue, or move card field
	  for (let id in param.card_pick) {
		let card = room.cards[id]
		let type = Object.keys(card.type.effect)[0]
		switch (type) {
		  case 'instant':
			let judge = this.default.all_card[card.name].judge[type]
			let card_eff = {tp: type, id: id, name: card.name, eff: [], initiator: personal}
			
			for (let effect in judge) 
			  card_eff.eff.push(effect)
		  
			if (card_eff.eff.length) room.effect_queue.unshift(card_eff)	  
			break
		  
		  case 'trigger':
		  case 'counter':
		  case 'chanting':
		  case 'permanent':
			param.card_pick[id] = {to: 'altar'}
			if (type === 'chanting') {
			  personal.chanting[card.id] = {to: 'grave', status: true}
			}	  
			break
			
		  default:
			break
		}	
	  }	
		
	  let rlt = this.cardMove(personal, param.card_pick)

	  //personal.emit('effectTrigger', {card: {reuse: { personal: rlt.personal, opponent: {} }}})
	  //personal._foe.emit('effectTrigger', {card: {reuse: { personal: {}, opponent: rlt.opponent }}})
	  return {
		eff: {
		  personal: {card: {reuse: { personal: rlt.personal, opponent: {} }}},
		  opponent: {card: {reuse: { personal: {}, opponent: rlt.opponent }}}
		}  	  
	  }
  },
  receive : function (personal, param) {
	  let room = this.room[personal._rid]
	  let dmg_taken = (param.id === 'attack')? ((personal._foe.atk_damage < 0)? 0 : personal._foe.atk_damage + Object.keys(personal._foe.aura.strength).length) : (personal.dmg_blk[0])
	  dmg_taken = ((personal.hp - dmg_taken) < 0)? personal.hp : dmg_taken
	  
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
	  //personal.emit('effectTrigger', Object.assign(rlt, {attr: {personal: {hp: personal.hp}, opponent: {hp: personal._foe.hp}}}))
	  //personal._foe.emit('effectTrigger', {card: genFoeRlt(rlt.card), attr: {opponent: {hp: personal.hp}, personal: {hp: personal._foe.hp}}})

	  return {
		eff: {
		  personal: Object.assign(rlt, {attr: {personal: {hp: personal.hp}, opponent: {hp: personal._foe.hp}}}),
		  opponent: {card: genFoeRlt(rlt.card), attr: {opponent: {hp: personal.hp}, personal: {hp: personal._foe.hp}}}	  
		}  
	  }
  },
  retrieve : function (personal, param) {
	  let room = this.room[personal._rid]
	  let effect = Object.assign({}, this.default.all_card[param.name].effect[param.tp][param.eff][param.tg])

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

	  //personal.emit('effectTrigger', {card: {retrieve: { personal: rlt.personal, opponent: {} }}})
	  //personal._foe.emit('effectTrigger', {card: {retrieve: { personal: {}, opponent: rlt.opponent }}})
	  return {
		eff: {
		  personal: {card: {retrieve: { personal: rlt.personal, opponent: {} }}},
		  opponent:	{card: {retrieve: { personal: {}, opponent: rlt.opponent }}}
		}  
	  }
  },
  recall : function (personal, param) {
	  let room = this.room[personal._rid]
	  let effect = Object.assign({}, this.default.all_card[param.name].effect[param.tp][param.eff][param.tg])

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

	  //personal.emit('effectTrigger', {card: {recall: { personal: rlt.personal, opponent: {} }}})
	  //personal._foe.emit('effectTrigger', {card: {recall: { personal: {}, opponent: rlt.opponent }}})
	  return {
		eff: {
		  personal: {card: {retrieve: { personal: {}, opponent: rlt.opponent }}},
		  opponent:	{card: {recall: { personal: {}, opponent: rlt.opponent }}} 
		}	
	  }
  },
  set : function (personal, effect, info = {}) {
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
	  //personal.emit('effectTrigger', rlt)
	  //personal._foe.emit('effectTrigger', genFoeRlt(rlt))
	  return {
		eff: {
		  personal: rlt,
		  opponent: genFoeRlt(rlt)
		}  
	  }
  },
  steal : function (personal, param) {
	  let room = this.room[personal._rid]
	  let effect = Object.assign({}, this.default.all_card[param.name].effect[param.tp][param.eff][param.tg])

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

	  let rlt = this.cardMove(personal, param.card_pick) 
	 
	  //personal.emit('effectTrigger', {card: {steal: { personal: rlt.personal, opponent: {} }}})
	  //personal._foe.emit('effectTrigger', {card: {steal: { personal: {}, opponent: rlt.opponent }}})
	  
	  return {
		eff: {
		  personal: {card: {steal: { personal: rlt.personal, opponent: {} }}},
		  opponent: {card: {steal: { personal: {}, opponent: rlt.opponent }}}
		}  
	  }
  },
  exchange : function (personal, param) {
	  let room = this.room[personal._rid]
	  let effect = Object.assign({}, this.default.all_card[param.name].effect[param.tp][param.eff][param.tg])

	  let card_pick = Object.keys(param.card_pick)
	  let total_len = 0
	  for (let tp in effect) {
		total_len += effect[tp]
		effect[tp] = {personal: effect[tp], opponent: effect[tp]}
	  }
	  if (card_pick.length > total_len*2 || (card_pick.length%2) != 0) return {err: 'error exchange length'}
	  
	  for (let id in param.card_pick) {
		let card = room.cards[id]
		let card_own = (card.curr_own === personal._pid)? 'personal' : 'opponent'
		let new_own = (card_own === 'personal')? 'opponent' : 'personal'
		if (card == null) return {err: 'no card id'}
		if (card.field !== 'hand') return {err: 'please choose hand card'}
		if (!('card' in effect) && !(card.type.base in effect)) return {err: 'error card type'}
		if (!effect[('card' in effect)? 'card' : card.type.base][card_own]) return {err: 'error type length'}
		effect[('card' in effect)? 'card' : card.type.base][card_own] --
		param.card_pick[id] = {new_own: new_own, to: 'hand'}
	  }

	  let rlt = this.cardMove(personal, param.card_pick)
	  
	  //personal.emit('effectTrigger', {card: {exchange: { personal: rlt.personal, opponent: {} }}})
	  //personal._foe.emit('effectTrigger', {card: {exchange: { personal: {}, opponent: rlt.opponent }}})
	  
	  return {
		eff: {
		  personal: {card: {exchange: { personal: rlt.personal, opponent: {} }}},
		  opponent: {card: {exchange: { personal: {}, opponent: rlt.opponent }}}	  
		}  
	  }
  },
  reverse : function (personal, effect, info = {}) {
	  let room = this.room[personal._rid]
	  let player = {personal: personal, opponent: personal._foe}
	  let mod_eff = Object.assign({}, effect)
	  
	  // init reverse field
	  let reverse_cards = {personal: {}, opponent: {}}
	  
	  // find reverse cards
	  for (let id in room.cards) {
		let card = room.cards[id]
		if (!(card.field in mod_eff.personal)) continue
		let card_owner = (card.curr_own === personal._pid)? 'personal' : 'opponent'
		
		if (card.field === 'battle') { 
		  if (card.checkCrossProtection()) continue
		}
		
		reverse_cards[card_owner][card.id] = {new_own: 'opponent', to: card.field}
	  }
	  
	  // generate return object
	  personal_reverse = this.cardMove(personal, reverse_cards.personal)
	  opponent_reverse = this.cardMove(personal._foe, reverse_cards.opponent)

	  //personal.emit('effectTrigger', {card: {reverse: { personal: personal_reverse.personal, opponent: opponent_reverse.opponent }}})
	  //personal._foe.emit('effectTrigger', {card: {reverse: { personal: opponent_reverse.personal, opponent: personal_reverse.opponent }}})
	  
	  return {
		eff: {
		  personal: {card: {reverse: { personal: personal_reverse.personal, opponent: opponent_reverse.opponent }}},
		  opponent: {card: {reverse: { personal: opponent_reverse.personal, opponent: personal_reverse.opponent }}}
		}  
	  }
  },
  teleport : function (personal, param) {
	  // to deck bottom is not available now
	  let room = this.room[personal._rid]
	  let effect = Object.assign({}, this.default.all_card[param.name].effect[param.tp][param.eff][param.tg])

	  let card_pick = Object.keys(param.card_pick)
	  let total_len = 0
	  for (let type in effect) {
		if (type[0] == '_') continue
		total_len += effect[type]
	  }
	  if ((card_pick.length < total_len && card_pick.length != personal.card_amount.hand) || (card_pick.length > total_len)) return {err: 'error teleport length'}
	  
	  let player = {personal: personal, opponent: personal._foe}
	  for (let id in param.card_pick) {
		let card = room.cards[id]
		if (card == null) return {err: 'no card id'}
		let card_owner = (card.curr_own === personal._pid)? 'personal' : 'opponent'
		if (!effect._target.includes(card_owner)) return {err: 'please choose opponent card'}

		if (card.field !== effect._from) return {err: 'error card field'}
		if (!('card' in effect) && !(card.type.base in effect)) return {err: 'error card type'}
		if (!effect[('card' in effect)? 'card': card.type.base]) return {err: 'error type length'}
		effect[('card' in effect)? 'card' : card.type.base] --
		if (card.field === 'battle') {
		  if (card.checkCrossProtection()) continue
		}
		param.card_pick[id] = {to: effect._to}
		if (id in player[card_owner].chanting) delete player[card_owner].chanting[id]
	  }

	  let rlt = this.cardMove(personal, param.card_pick)

	  //personal.emit('effectTrigger', {card: {teleport: { personal: rlt.personal, opponent: {} }}})
	  //personal._foe.emit('effectTrigger', {card: {teleport: { personal: {}, opponent: rlt.opponent }}})
	  return {
		eff: {
		  personal: {card: {teleport: { personal: rlt.personal, opponent: {} }}},
		  opponent: {card: {teleport: { personal: {}, opponent: rlt.opponent }}}
		}  
	  }
  }  
}