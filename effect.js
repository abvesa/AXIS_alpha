
function genFoeRlt (param) {
  let rlt = {}
  for (let type in param) {
	rlt[type] = {personal: param[type].opponent, opponent: param[type].personal}  
  }
  return rlt
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
	  //personal.emit('effectTrigger', Object.assign(rlt, {attr: {personal: {hp: personal.hp}, opponent: {hp: personal._foe.hp}}}))
	  //personal._foe.emit('effectTrigger', {card: genFoeRlt(rlt.card), attr: {opponent: {hp: personal.hp}, personal: {hp: personal._foe.hp}}})
	  
	  return {
		eff: {
		  personal: Object.assign(rlt, {attr: {personal: {hp: personal.hp}, opponent: {hp: personal._foe.hp}}}),
		  opponent: {card: genFoeRlt(rlt.card), attr: {opponent: {hp: personal.hp}, personal: {hp: personal._foe.hp}}}
		}
	  }
  }
}