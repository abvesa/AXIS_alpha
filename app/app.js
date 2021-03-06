const socket = io()

// global variables (default values)

const opt = {
  screen: {
    height: document.documentElement.clientHeight, // browser height
    width : document.documentElement.clientWidth   // browser width
  }
}

const Game = function () {
  this.curr_page = 'start'
  this.default = {
    game: {
      height: 768,
      width: 1366
    },
    button: {
      height: 43,
      width: 88
    },
    card: {
      height: 91,
	  width: 64,
	  describe: {}
    },
    text: {
      phase: -75,
      action: -20,
      cursor: 35,
      effect: -750,
      end: -20
    },
    player: {
      personal: {
        y: { altar: 167, battle: 277, deck: 57, grave: 167, hand: 57, life: 57, socket: 381}
      },
      opponent: {
        y: { altar: 603, battle: 493, deck: 713, grave: 603, hand: 713, life: 713, socket: 389}
      }
    },
    scale: 768*(window.screen.width/window.screen.height)/1366//768*(opt.screen.width/opt.screen.height)/1366
  }

  for (let field in this.default.player.personal.y) {
    this.default.player.personal.y[field] = this.default.game.height - this.default.player.personal.y[field] / this.default.scale
    this.default.player.opponent.y[field] = this.default.game.height - this.default.player.opponent.y[field] / this.default.scale
  }

  this.player = {
    personal: new Player(),
    opponent: new Player()
  }

  this.page = {
    start: {
      login: { type: 'button', x: this.default.game.width/2 - 100, y: this.default.game.height*0.75, img: 'login', func: this.changePage, ext: {next: 'login'} },
      sign_up: {type: 'button', x: this.default.game.width/2 + 12, y: this.default.game.height*0.75, img: 'signup', func: this.changePage, ext: {next: 'sign_up'}}
    },
    login: {
      login: {type: 'html', id: 'login'},
      back: {type: 'button', x: 0, y: this.default.game.height - 43, img: 'back', func: this.changePage, ext: {next: 'start'} }
    },
    sign_up:{
      sign_up: {type: 'html', id: 'signup'},
      back: {type: 'button', x: 0, y: this.default.game.height - 43, img: 'back', func: this.changePage, ext: {next: 'start'} }
    },
    lobby: {
      deck_build: {type: 'button', x: 0, y: 0, img: 'decks', func: this.changePage, ext: {next: 'deck_build'} },
      match_search: {type: 'button', x: 0, y: 43, img: 'battle', func: this.changePage, ext: {next: 'match_search'} }
    },
    deck_build: {
      back: {type: 'button', x: 0, y: this.default.game.height - 43, img: 'back', func: this.changePage, ext: {next: 'lobby'} }
    },
    deck_view: {
      back: {type: 'button', x: 0, y: this.default.game.height - 43, img: 'back', func: this.changePage, ext: {next: 'deck_build'} },
      next: {type: 'button', x: this.default.game.width - 200, y: this.default.game.height/2 + 70, img: 'nextBtn', func: this.showTexture, ext: {page: 1} },
      prev: {type: 'button', x: 155, y: this.default.game.height/2 + 70, img: 'prevBtn', func: this.showTexture, ext: {page: -1} }
    },
    match_search: {
      search: {type: 'button', x: this.default.game.width - 88, y: this.default.game.height - 43, img: 'search', func: this.player.personal.searchMatch, ext:{ next: 'loading'} },
      back: {type: 'button', x: 0, y: this.default.game.height - 43, img: 'back', func: this.changePage, ext: {next: 'lobby'} }
    },
    loading: {
	  back: {type: 'button', x: 0, y: this.default.game.height - 43, img: 'cancel', func: this.cancelSearchMatch}		
	},
    game: {
	  bg_up: {type: 'sprite', x: 0, y: 0, img: 'bg_up'},
	  bg_dn: {type: 'sprite', x: 0, y: 384, img: 'bg_dn'},
      personal_deck: { type: 'sprite', x: this.default.game.width*(1 - 1/13) + 32 + 20 + 10, y: this.default.player.personal.y.deck, img: 'cardback', func: {onInputDown: this.player.personal.drawCard} },
      opponent_deck: { type: 'button', x: this.default.game.width*(1 - 1/13) + 32 + 20 + 10, y: this.default.player.opponent.y.deck, img: 'cardback', func: null },
      personal_grave: { type: 'button', x: this.default.game.width*(1 - 1/13) + 32 + 20 + 10, y: this.default.player.personal.y.grave, img: 'emptySlot', func: this.showGraveCards, ext: {owner: 'personal', show: false} },
      opponent_grave: { type: 'button', x: this.default.game.width*(1 - 1/13) + 32 + 20 + 10, y: this.default.player.opponent.y.grave, img: 'emptySlot', func: this.showGraveCards, ext: {owner: 'opponent', show: false} },
      end_turn: {type: 'button', x: this.default.game.width - 121 + 44 + 12 + 9, y: this.default.game.height/2 - 44/this.default.scale + 21, img: 'endTurn', func: this.player.personal.endTurn},
      leave: {type: 'button', x: this.default.game.width/2 + 12, y: this.default.game.height/2, img: 'leave', func: this.player.personal.leaveMatch, ext: {next: 'lobby', req: true} },
      setting_panel: {type: 'sprite', x: this.default.game.width/2 + 12, y: this.default.game.height/2, img: 'setting', ext: {req: true} },
      end_match: {type: 'sprite', x: this.default.game.width/2, y: this.default.game.height/2, img: 'end_match', func: {onInputDown: this.player.personal.matchEnd}, ext: {next: 'lobby', req: true} },

      // normal action
      attack: {type: 'button', x: this.default.game.width - 121 + 44 + 12 + 9, y: this.default.game.height/2 + 11/this.default.scale + 21, img: 'attack', func: this.player.personal.attack},
      conceal: {type: 'button', x: this.default.game.width - 121 + 44 + 12 + 9, y: this.default.game.height/2 + 11/this.default.scale + 21, img: 'conceal', func: this.player.personal.conceal, ext: {action: 'conceal', req: true} },
      tracking: {type: 'button', x: this.default.game.width - 121 + 44 + 12 + 9, y: this.default.game.height/2 + 11/this.default.scale + 21, img: 'tracking', func: this.player.personal.tracking, ext: {action: 'tracking', req: true} },
      give_up: {type: 'button', x: this.default.game.width - 220 + 44 + 12 + 9, y: this.default.game.height/2 + 11/this.default.scale + 21 , img: 'giveup', func: this.player.personal.giveUp, ext: {req: true} },

      // counter card
      counter: {type: 'button', x: this.default.game.width - 121 + 44 + 12, y: this.default.game.height/2 + 66/this.default.scale + 21, img: 'counter', func: this.player.personal.counter, ext: {req: true} },
      pass: {type: 'button', x: this.default.game.width - 220 + 44 + 12, y: this.default.game.height/2 + 66/this.default.scale + 21, img: 'pass', func: this.player.personal.pass, ext: {req: true} },

      // effect
      choose: {type: 'button', x: this.default.game.width - 121 + 44 + 12 + 9, y: this.default.game.height/2 + 66/this.default.scale + 21, img: 'choose', func: this.player.personal.effectChoose, ext: {req: true} },

      // block dmg
      block: {type: 'button', x: this.default.game.width - 121 + 44 + 12, y: this.default.game.height/2 + 66/this.default.scale + 21, img: 'block', func: this.player.personal.block, ext: {req: true} },
      receive: {type: 'button', x: this.default.game.width - 121 + 44 + 12 + 9, y: this.default.game.height/2 + 66/this.default.scale + 21, img: 'receive', func: this.player.personal.receive, ext: {req: true} }
    }
  }
  this.phaser = null
  this.tween = null
  this.text = {
    phase: {init: {font: "26px Arial", fill: '#ffffff', align: 'left'}, x: 51},
    action: {init: {font: "26px Arial", fill: '#ffffff', align: 'left'}, x: 51},
    cursor: {init: {font: "26px Arial", fill: '#ffffff', align: 'left'}, x: 51},
    effect: {init: {font: "20px Arial", fill: '#ffffff', align: 'left'}, x: 51},
    stat: {init: {font: "20px Arial", fill: '#ffffff', align: 'left'}, x: 33},
    end: {init: {font: "50px Arial", fill: '#ffffff', align: 'center'}, x: this.default.game.width/2}
  }
  this.text_group = null
  this.card_eff = {empty: '', cardback: 'covered'}
  this.sfx = {}
}

Game.prototype.attrPanel = function (param) {
  for (let player in param) {
    for (let attr in param[player]) {
	  $(`#${player} .attr_ele.${attr} .attr_value`).text(param[player][attr])
    }
  }
}

Game.prototype.textPanel = function (text) {
  if (text.phase) game.text.phase.setText(text.phase)
  if (text.action) game.text.action.setText(text.action)
  if (text.cursor) game.text.cursor.setText(text.cursor)
  if (text.effect) {
	game.text.effect.setText(game.card_eff[text.effect])
    game.phaser.world.bringToTop(game.text_group)	
  }
  if (text.stat) {
	game.text.effect.setText(text.stat)
    game.phaser.world.bringToTop(game.text_group)
  }
  if (text.end) {
    game.text.end.setText(text.end)
    game.phaser.world.bringToTop(game.text.end)
  }
  //game.phaser.world.bringToTop(game.page.game.stat_panel)
}

Game.prototype.actionReminder = function (type) {
  /* 
  *** Phaser method ***
  this.music[name].volume = 0
  this.music[name].play()	  
  game.add.tween(this.music[name]).to({volume:1}, 1000).start()
  */
  
  let curr_src = this.sfx[type]
  let curr_type = `audio/${curr_src.split('.')[curr_src.split('.').length - 1]}`
  
  $('audio source').attr({src: curr_src, type: curr_type})
  $('audio')[0].load()
  $('audio')[0].play()
}

Game.prototype.backgroundPanel = function (your_turn) {
  game.page.game.end_turn.alpha = (your_turn)? 1 : 0.3 
  game.page.game.attack.alpha = (your_turn)? 1 : 0.3
	
  if (your_turn) {
    game.tween = game.phaser.add.tween(game.page.game.bg_up).to(
      {alpha: 1}, 500, Phaser.Easing.Sinusoidal.In, true
    )
	game.tween = game.phaser.add.tween(game.page.game.bg_dn).to(
        {alpha: 0}, 500, Phaser.Easing.Sinusoidal.Out, true
    )
  }
  else {
	game.tween = game.phaser.add.tween(game.page.game.bg_dn).to(
      {alpha: 1}, 500, Phaser.Easing.Sinusoidal.In, true
    )
	game.tween = game.phaser.add.tween(game.page.game.bg_up).to(
        {alpha: 0}, 500, Phaser.Easing.Sinusoidal.Out, true
    )
  }
}

Game.prototype.flickerPanel = function (on, info = {}) {
  let flicker_panel = this.page.game.flicker_panel
  
  if (on) {
	flicker_panel._avail = true  
	  
	// add cards into flicker panel  
	for (let player in info._target) {
	  for (let field in info._from) {
		for (let card of this.player[player][field]) {
		  flicker_panel.addChild(card.body)
		  flicker_panel._flicker_list[card.id] = true
	    }
	  }
	}  	  
	  
	// start animation
	flicker_panel.alpha = 0.3
    flicker_panel._self_tween = game.phaser.add.tween(flicker_panel).to( 
	  {alpha: 0.9}, 1000, Phaser.Easing.Linear.None, true, 0, 500, true
	)
  }
  else {
	flicker_panel._avail = false  
	  
	flicker_panel._self_tween.stop()  	
	flicker_panel._flicker_list = {}
	while (flicker_panel.children.length) {
	  let sprite = flicker_panel.children[0]
	  game.phaser.world.addChild(sprite)	
	}
  }
}

Game.prototype.buildFieldPanel = function (card_list, width = 7, height = 3, indent = 20, scaler = 1.3) {
  let field_panel = this.page.game.field_panel
  if (Object.keys(card_list).length == 0) field_panel.removeChildren(begin = 0)

  let init_x = -1 * (parseInt(width/2)) * (this.default.card.width + indent) * scaler
  let init_y = -1 * (parseInt(height/2)) * (this.default.card.height + indent) * scaler

  for (let [idx, key] of Object.keys(card_list).entries()) {
  //for (let [idx, ele] of card_list.entries()) {
    let x = init_x + (idx % width) * (game.default.card.width + indent) * scaler
    let y = init_y + parseInt(idx/width) * (game.default.card.height + indent) * scaler
    let curr = game.phaser.add.sprite(x, y, card_list[key])//ele.name)
    curr.anchor.setTo(0.5)
    curr.scale.setTo(scaler)
    curr._id = key//ele.id
    curr._this = false

    curr.inputEnabled = true
    curr.events.onInputOver.add( function () {
      game.textPanel({effect: card_list[key]})//ele.name})
	  let mod_x = field_panel.x + curr.x
	  if (mod_x < game.default.game.width/3) mod_x -= game.default.card.width/2*scaler
	  else {
	    if (mod_x <= game.default.game.width*2/3) mod_x -= game.text.effect.width/2
	    else mod_x -= (game.text.effect.width - game.default.card.width/2*scaler)
	  }	
	  game.text.effect.reset(mod_x, field_panel.y + curr.y + game.default.card.height/2*scaler + 10)
    })
    curr.events.onInputOut.add( function () {
      game.textPanel({effect: 'empty'})
    })
    curr.events.onInputDown.add( function () {
      curr._this = (curr._this)? false : true
      personal.chooseCard({img: curr, id: curr._id})
    })

    field_panel.addChild(curr)
  }

  field_panel.reset(field_panel.x, field_panel.y)
  this.phaser.world.bringToTop(field_panel)
}

Game.prototype.viewFieldCards = function () {
  let field = game.phaser.input.mouse._last_over_scroll
  if (game.phaser.input.mouse.wheelDelta === Phaser.Mouse.WHEEL_UP) {
    for (let card of field.children) {
      card.y -= 45
    }
  }
  else {
    for (let card of field.children) {
      card.y += 45
    }
  }
}

Game.prototype.showGraveCards = function (obj) {
  let owner = obj.owner
  let show = obj.show
  let opponent = (owner === 'personal')? 'opponent' : 'personal'
  console.log(obj)
  
  if (show) {
	let field_panel = this.page.game.field_panel
    field_panel.removeChildren(begin = 0)
    field_panel.kill()    
	obj.show = false
  }
  else {
	let card_list = {}
	for (let card of this.player[owner].grave) {
	  card_list[card.id] = card.name 	
	}	
	console.log(card_list)
	this.buildFieldPanel(card_list)  
	obj.show = true
	this.page.game[`${opponent}_grave`].show = false
  }
}

// param = {personal: {stat1: true, stat2: false}, opponent: {} ...}
Game.prototype.statPanel = function (param) {
  for (let target in param) {
    let idx = 0
    let st = (target === 'personal')? 353 : -353
    let nx = (target === 'personal')? -40 : 40
    let curr = game.player[target].stat
    for (let name in curr) {
      if (name in param[target]) curr[name].status = param[target][name]
      if (curr[name].status) {
        if (game.page.game.stat_panel.children.indexOf(curr[name].img) == -1) game.page.game.stat_panel.addChild(curr[name].img)
        curr[name].img.reset(0, st + nx*idx)
        idx ++
      }
      else game.page.game.stat_panel.removeChild(curr[name].img)
    }
  }
}

Game.prototype.showStat = function () {
  let stat_pnl = this.page.game.stat_panel
  stat_pnl.reset((stat_pnl.x == -15)? 25 : -15, this.default.game.height/2)
  game.phaser.world.bringToTop(stat_pnl)
}

// to close panel, option = {}
Game.prototype.choosePanel = function (option) {
  let name = (option.rlt == null)? null : Object.keys(option.rlt)
  for (let idx of [1, 2]) {
    let curr = game.page.game[`choose_${idx}`]
    if (name == null) {
      console.log('clear')
      curr.kill()
      curr.eff_name = null
    }
    else {
      let x = 600 + (idx-1)*340
      let y = 350
      curr.reset(x, y)
      curr.eff_name = name[idx-1]
      curr.cid = option.cid
      curr.children[0].setText(game.textModify(option.rlt[name[idx-1]]))
      game.phaser.world.bringToTop(curr)
    }
  }
}

Game.prototype.textModify = function (text) {
  let rlt = text.split('\n')[0] + '\n'
  let remain = text.split('\n')[1].split(' ')
  let tmp = ''

  for (let [idx, word] of remain.entries()) {
    if ((tmp + word).length <= 24) tmp += word
    else {
      while (tmp.length < 24) tmp += ' '
      tmp += '\n'
      rlt += tmp
      tmp = word
    }
    if (idx != remain.length - 1) tmp += ' '
  }
  if (tmp.length) rlt += tmp
  return rlt
}

Game.prototype.chooseOne = function (curr) {
  //socket.emit('checkUse', {id: curr.cid, eff: curr.eff_name}, it => {
  socket.emit('clickCard', {id: curr.cid, eff: curr.eff_name}, it => {
    if (it.err) return game.textPanel({cursor: it.err})
    game.textPanel(it)
    this.choosePanel({})
  })
}

Game.prototype.blockPanel = function (action) {
  let block_btn = this.page.game.block
  let receive_btn = this.page.game.receive

  if (action.damage) {
    //block_btn.reset(block_btn.x, block_btn.y)
    //receive_btn.reset(receive_btn.x, receive_btn.y)
    receive_btn.reset(receive_btn.x, receive_btn.y)
  }
  else {
    //block_btn.kill()
    receive_btn.kill()
  }
}

// action = {pass: true, personal: true ...}
Game.prototype.counterPanel = function (action) {
  let counter_btn = this.page.game.counter
  let pass_btn = this.page.game.pass

  if (action.opponent && action.counter) {
    counter_btn.reset(counter_btn.x, counter_btn.y)
    pass_btn.reset(pass_btn.x, pass_btn.y)
  }
  else {
    counter_btn.kill()
    pass_btn.kill()
  }
}

// action = {give_up: true, conceal: true ...}
Game.prototype.attackPanel = function (action) {
  let atk_btn = this.page.game.attack
  let give_up = this.page.game.give_up

  if (action.give_up) {
    let elem = ((action.personal && action.conceal) || (action.opponent && action.tracking))?'conceal':'tracking'
    atk_btn.reset(atk_btn.x, atk_btn.y)
    this.page.game[elem].kill()
    give_up.kill()
  }
  else {
    if (action.personal) {
      let elem = (action.attack)? 'attack' : ((action.conceal)? 'conceal' : 'tracking')
      this.page.game[elem].kill()
      give_up.kill()
    }
    else {
      let foe_action = (action.attack)? 'attack' : ((action.conceal)? 'conceal' : 'tracking')
      let elem = (action.attack || action.tracking)? 'conceal' : 'tracking'
      atk_btn.kill()
      this.page.game[elem].reset(atk_btn.x, atk_btn.y)
      give_up.reset(give_up.x, give_up.y)
    }
  }
}

Game.prototype.showSetting = function () {
  for (let elem of ['setting_panel', 'leave']) {
    if (game.page.game[elem].exists) game.page.game[elem].kill()
    else {
      game.page.game[elem].reset(game.default.game.width/2, game.default.game.height/2)
      game.phaser.world.bringToTop(game.page.game[elem])
    }
  }
}

Game.prototype.cancelSearchMatch = function () {
  socket.emit('cancelSearchMatch', {}, it => {
    game.textPanel({cursor: ''})
	game.changePage({next: 'match_search'})
  })  
}

Game.prototype.changePage = function (obj) {
  let old_page = this.page[this.curr_page]
  let new_page = this.page[obj.next]

  if (old_page) {
	if (this.curr_page === 'game') {
	  $('.attr.panel').children().css({visibility: 'hidden'})
	}  
	  
    for (let elem in old_page) {
      if (Array.isArray(old_page[elem])) old_page[elem] = []
      else {
        if ('html' === old_page[elem].type)
          this.shiftInputForm(old_page[elem], 'bottom')
        else
          old_page[elem].kill()
      }
    }
  }
  this.curr_page = obj.next
  if (new_page) {
	if (obj.next === 'game') {
	  $('.attr.panel').children().css({visibility: 'visible'})
	}  
	  
    for (let elem in new_page) {
      if(!('req' in new_page[elem])){
        if ('html' === new_page[elem].type)
          this.shiftInputForm(new_page[elem], 'front')
        else
          if(!Array.isArray(new_page[elem]))
            new_page[elem].reset(new_page[elem].x, new_page[elem].y)
      }
    }
  }

  // variable reset due to page change
  if (this.curr_page !== 'game' && this.curr_page !== 'loading') personal.curr_deck = null
  game.textPanel({phase: ' ', action: ' ', cursor: ' ', end: ' '})
  $('audio')[0].pause()
}

Game.prototype.cardMove = function (rlt) {
// rlt = {
//         id: {
//           from:
//           curr_own:
//           new_own:
//           to:
//
//           name:
//           action:   // when equip, cast ...
//           skt:      // card (id) choose to socket, when to == socket
//           cover:    // card is remain open or become covered
//         }
//       }
  let fix_field = {personal: {}, opponent: {}}
  for (let id in rlt) {
    rlt[id].id = id
    let pos = this.findCard(rlt[id])
    let card = game.player[rlt[id].curr_own][rlt[id].from][pos]

    // adjust card attribute
    card.img.inputEnabled = (rlt[id].to === 'grave')? false: true
    card.field = rlt[id].to
    card.name = rlt[id].name
    card.owner = rlt[id].new_own
    
	//card.img.loadTexture((rlt[id].cover)? 'cardback' : card.name)
	if (rlt[id].from === 'grave') { 	
	  card.body.angle = 0
	  card.body.reset(game.page.game[`${rlt[id].curr_own}_grave`].x, game.page.game[`${rlt[id].curr_own}_grave`].y)	
	  if (game.page.game[`${rlt[id].curr_own}_grave`].key === card.name) {
		let img_name = (pos != 0)? game.player[rlt[id].curr_own].grave[pos-1].name : 'emptySlot'
		game.page.game[`${rlt[id].curr_own}_grave`].loadTexture(img_name)  
	  }
	}	
	
	//console.log(rlt[id].cover, card.name, id, card.img.key)
	if ((rlt[id].cover && card.img.key !== 'cardback') || (!rlt[id].cover && card.img.key !== card.name)) {
	  if (!(rlt[id].from === 'life' && (rlt[id].to === 'battle' || rlt[id].to === 'altar' || rlt[id].to !== 'socket'))) card.flip()
    }
    card.frame.visible = false
    
    if (rlt[id].to === 'socket' || rlt[id].from === 'socket') {
      let tg_atf = (rlt[id].on)? (rlt[id].on) : (rlt[id].off)
      let param = {curr_own: rlt[id].curr_own, from: 'battle', id: tg_atf}
      let skt = game.player[rlt[id].curr_own].battle[this.findCard(param)]
      card.bond = (rlt[id].to === 'socket')? tg_atf : (null)
      if (rlt[id].to === 'socket') {
        skt.socket[card.id] = true
        this.tween = this.phaser.add.tween(card.body).to(
          {x: skt.body.x, y: skt.body.y, visible: false}, 300, Phaser.Easing.Sinusoidal.InOut, true
        )
      }
      else {
        delete skt.socket[card.id]
      }

      skt.frame.visible = (Object.keys(skt.socket).length)? true : false
    }

    // move
	if (rlt[id].to !== 'deck') game.player[rlt[id].new_own][rlt[id].to].push(card)
	else {	
		card.body.destroy()	
		if (rlt[id].deck_refill) game.page.game[`${rlt[id].new_own}_deck`].reset(this.default.game.width*(1 - 1/13) + 32 + 20 + 10, this.default.player[`${rlt[id].new_own}`].y.deck)
	}
	game.player[rlt[id].curr_own][rlt[id].from].splice(pos, 1)
	
    // field to fix
    fix_field[rlt[id].curr_own][rlt[id].from] = true
    fix_field[rlt[id].new_own][rlt[id].to] = true
  }

  this.fixCardPos(fix_field)
}

Game.prototype.findCard = function (rlt) {
  for (let [index, elem] of game.player[rlt.curr_own][rlt.from].entries()) {
    if(elem.id === rlt.id) return index
  }
}

// rlt = {personal: {hand: true}, opponent: {}}
Game.prototype.fixCardPos = function (rlt) {
  for (let target in rlt){
    for (let field in rlt[target]) {
      let tg_field = this.player[target][field]
      let init_x = 0
      switch (field) {
		case 'deck':
			break
			
        case 'grave':
          for (let card of tg_field) {
            if (!card.body.alive) continue
            this.tween = this.phaser.add.tween(card.body).to(
              {
                x: this.page.game[`${target}_grave`].x,
                y: this.page.game[`${target}_grave`].y,
                alpha: 1,
                angle: 0,
				visible: true
              },
              300, Phaser.Easing.Sinusoidal.InOut, true
            )
            this.tween.onComplete.add(() => {
              card.body.kill()
              game.page.game[`${target}_grave`].loadTexture(card.name)
            })
          }
          break

        case 'life':
          init_x = 21 + this.default.card.width/2 + 20 + 10
          for (let [idx, card] of tg_field.entries()) {
            let x = init_x + this.default.card.width*6/5*Math.floor(idx/2) + 12
            let y = game.default.player[target].y[(idx%2)? 'altar' : 'battle'] + game.default.card.height/2*((target === 'personal')? 1 : -1)
            this.tween = this.phaser.add.tween(card.body).to(
              {x: x, y: y, alpha: 1, angle: 0}, 300, Phaser.Easing.Sinusoidal.InOut, true
            )
          }
          break
		  
        case 'socket':
          break

        default:
          init_x = this.default.game.width/2 - this.default.card.width*3/5*(tg_field.length - 1) + this.default.card.width*6/5
          for (let [idx, card] of tg_field.entries()) {
            let x = init_x + this.default.card.width*6/5*idx + 12 + 40
            let y = game.default.player[target].y[`${field}`]
            this.tween = this.phaser.add.tween(card.body).to(
              {x: x, y: y, alpha: 1, angle: (field === 'hand')? 0 : card.body.angle, visible: true}, 300, Phaser.Easing.Sinusoidal.InOut, true
            )
          }
          break
      }
    }
  }
}

Game.prototype.soundInit = function () {
  for (let type in game.sfx) {
	game.sfx[type] = game.phaser.add.audio(type)
    
	// you can add sound marker here
	
  }
}

Game.prototype.pageInit = function () {
  // add general items
  for (let page_name in this.page) {
    for (let elem_name in this.page[page_name]) {
      let elem = this.page[page_name][elem_name]
      if(elem != null){
        let next = elem.next
        if (elem.type !== 'html') {
          if (elem.type === 'button') this.page[page_name][elem_name] = game.phaser.add[elem.type](elem.x, elem.y, elem.img, elem.func, this)
          if (elem.type === 'sprite') {
            this.page[page_name][elem_name] = game.phaser.add[elem.type](elem.x, elem.y, elem.img)
            if (elem.func) {
              this.page[page_name][elem_name].inputEnabled = true
              for (let tp in elem.func) this.page[page_name][elem_name].events[tp].add(function(){ elem.func[tp]() }, this)
            }
          }

          if ('ext' in elem) Object.assign(this.page[page_name][elem_name], elem.ext)
          this.page[page_name][elem_name].kill()
          if (page_name === 'game' && (elem_name !== 'bg_dn' && elem_name !== 'bg_up')) this.page[page_name][elem_name].anchor.setTo(0.5, 0.5)
        }
      }
    }
  }

  // add cards in deck view page
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 5; j++) {
      let x = (this.default.game.width - (5*this.default.card.width + 4*84))/2 + (this.default.card.width + 84)*j
      let y = this.default.game.height/2 - 40 - this.default.card.height + (80 + this.default.card.height)*i
      let card = game.phaser.add.sprite(x, y, 'emptySlot')
      card.describe = game.phaser.add.text(x, y + this.default.card.height, "",  { font: "20px Arial", fill: '#000000', backgroundColor: 'rgba(255,255,255,0.5)'})
      card.inputEnabled = true
      card.events.onInputOver.add(function(){card.describe.reset(card.describe.x, card.describe.y)}, this)
      card.events.onInputOut.add(function(){card.describe.kill()}, this)
      card.kill()
      card.describe.kill()
      this.page.deck_view[`card_${j+1+(i*5)}`] = card
    }
  }

  // add field panel in game page
  let field_panel = game.phaser.add.sprite(this.default.game.width/2 + 25, this.default.game.height/2, 'deck_panel')
  field_panel.anchor.setTo(0.5)
  field_panel.inputEnabled = true
  field_panel.events.onInputOver.add( function () {
    game.phaser.input.mouse._last_over_scroll = field_panel
    game.phaser.input.mouse.mouseWheelCallback = this.viewFieldCards
  }, this)
  field_panel.events.onInputOut.add( function () {
    game.phaser.input.mouse._last_over_scroll = null
    game.phaser.input.mouse.mouseWheelCallback = null
  }, this)
  let mask = game.phaser.add.graphics(this.default.game.width/2 + 25 - 500, this.default.game.height/2 - 270)
  mask.beginFill(0xffffff)
  mask.drawRect(0,0, 1000, 540)
  mask.endFill()
  field_panel.mask = mask
  field_panel.req = true
  field_panel.kill()
  this.page.game.field_panel = field_panel
  
  // add choose panel in game page
  let flicker_panel = game.phaser.add.sprite(0, 0, null)
  flicker_panel._flicker_list = {}
  flicker_panel._avail = false
  flicker_panel._self_tween = null

  flicker_panel.anchor.setTo(0.5)
  flicker_panel.inputEnabled = true
  flicker_panel.kill()
  this.page.game.flicker_panel = flicker_panel  
  
  // add cards in game page
  for (let field of ['altar', 'battle', 'hand', 'life']) {
    this.page.game[`personal_${field}`] = personal[field]
    this.page.game[`opponent_${field}`] = opponent[field]
  }

  // add choose text in game page
  for (let type of [1, 2]) {
    let curr = this.page.game[`choose_${type}`] = game.phaser.add.sprite(0, 0, 'choose_one')
    curr.inputEnabled = true
    curr.events.onInputDown.add(function(){game.chooseOne(curr)})
    curr.anchor.setTo(0.5, 0.5)
    curr.req = true
    curr.eff_name = null
    curr.cid = null

    let text = game.phaser.add.text(0, 0, "", {font: '20px arial', fill: '#001EFF'})
    text.inputEnabled = true
    text.events.onInputDown.add(function(){game.chooseOne(curr)})
    text.anchor.setTo(0.5, 0.5)
    curr.addChild(text)

    curr.kill()
  }

  // add keyboard input
  $(document).keydown( function(e) {
    switch (e.keyCode) {
      case 27: // esc for setting panel
        if (game.curr_page !== 'game') return console.log('not in game')
        game.showSetting()
        break

      default: break
    }
  })

  // done
  this.changePage({next: 'start'})
}

Game.prototype.resetCardPick = function () {
  for (let id in personal.card_pick) {
    personal.card_pick[id].img.alpha = 1
  }
  personal.card_pick = {}
}

Game.prototype.resetPlayer = function () {
  for (let field of ['altar', 'battle', 'grave', 'hand', 'life']){
    for (let card of personal[field]) {
      card.body.destroy()
    }
    personal[field] = []
    for (let card of opponent[field]) {
      card.body.destroy()
    }
    opponent[field] = []
  }
  
  for (let stat_name in personal.stat) {
	if (personal.stat[stat_name].status) personal.stat[stat_name].status = false
    if (opponent.stat[stat_name].status) opponent.stat[stat_name].status = false
  }
  
  this.page.game.stat_panel.removeChildren(begin = 0)
  this.page.game.field_panel.removeChildren(begin = 0)
  this.page.game.personal_grave.loadTexture('emptySlot')
  this.page.game.opponent_grave.loadTexture('emptySlot')
}

Game.prototype.shiftInputForm = function (elem, place) {
  let i = (place === 'front')? 1: -1
  if (elem.id) $(`#${elem.id}`).css('zIndex', i)
}

Game.prototype.showTexture = function (btn) {
  let deck = personal.deck_slot[personal.curr_deck]
  let next_btn = this.page.deck_view.next
  let prev_btn = this.page.deck_view.prev

  if (btn.init) deck.page = btn.init
  else deck.page += btn.page

  let start_pos = (deck.page - 1)*10
  let card_list = deck.card_list.slice(start_pos, start_pos + 10)

  // show or hide prev/next button
  if (deck.page == 1) prev_btn.kill()
  else prev_btn.reset(prev_btn.x, prev_btn.y)

  if (deck.card_list.length - start_pos <= 10) next_btn.kill()
  else next_btn.reset(next_btn.x, next_btn.y)

  // change card texture
  let index = 1
  for (let elem_name in this.page.deck_view) {
    if(elem_name === `card_${index}`){
      this.page.deck_view[elem_name].loadTexture( (card_list[index - 1])?card_list[index - 1]:(null)/*'emptySlot'*/ )
      this.page.deck_view[elem_name].describe.setText( (card_list[index - 1])?card_list[index - 1]:'' )
      index++
    }
  }
}

const Player = function () {
  // attribute
  this.card_pick = {}
  this.curr_deck = null
  this.deck_slot = {} // total decks
  this.eff_queue = []

  // game field
  this.altar = []
  this.battle = []
  this.grave = []
  this.hand = []
  this.life = []
  this.socket = []
  this.record_deck = []

  // stat
  this.stat = {} // whenever a stat is add or remove, trigger a function to show icon
}

Player.prototype.attack = function () {
  socket.emit('attack', it => {
    if(it.err) return game.textPanel({cursor: it.err})
	game.textPanel(it.msg)
  })
}

Player.prototype.conceal = function () {
  socket.emit('useVanish', {card_pick: buildList(personal.card_pick), conceal: true}, it => {
    if(it.err) return game.textPanel({cursor: it.err})
  })
}

Player.prototype.tracking = function () {
  socket.emit('useVanish', {card_pick: buildList(personal.card_pick), tracking: true}, it => {
    if(it.err) return game.textPanel({cursor: it.err})
  })
}

Player.prototype.giveUp = function () {
  socket.emit('giveUp')
}

Player.prototype.block = function () {
  personal.eff_queue[0].decision = 'block'
  personal.effectChoose()
}

Player.prototype.receive = function () {
  personal.eff_queue[0].decision = 'receive'
  personal.effectChoose()
}

Player.prototype.counter = function () {
  socket.emit('counter', {card_pick: buildList(personal.card_pick)}, it => {
    if (it.err) return game.textPanel({cursor: it.err})
  })
}

Player.prototype.pass = function () {
  socket.emit('pass')
}

Player.prototype.effectChoose = function () {
  let param = {card_pick: null}
  Object.assign(param, personal.eff_queue[0])
  param.card_pick = buildList(personal.card_pick)
  if (personal.eff_queue.length == 1) param.last = true

  socket.emit('effectChoose', param, it => {
    if (it.err) return game.textPanel({cursor: it.err})
    
    // close flicker panel
	if (game.page.game.flicker_panel._avail) game.flickerPanel(false)
	
	// if needed remove retrieve choose panel here

    if (param.eff.split('_')[0] === 'damage') game.blockPanel({done: true})
    personal.eff_queue.shift()
    game.resetCardPick()
    if (!personal.eff_queue.length) {
      game.page.game.choose.kill()
      game.textPanel({action: 'effect done'})
    }
    else {
	  personal.effectLoop()
	  //game.textPanel({action: `${personal.eff_queue[0].name} ${personal.eff_queue[0].eff}`})
    }
  })
}

Player.prototype.effectLoop = function () {
  if (personal.eff_queue.length) {
    let curr_eff = personal.eff_queue[0].eff.split('_')[0]
	
    if (curr_eff === 'damage') {
	  game.actionReminder('damage_hit')
	  game.blockPanel({damage: true})
	  game.flickerPanel(true, personal.eff_queue[0].info)
	}
	else {
      if (curr_eff === 'retrieve' || curr_eff === 'recall' || curr_eff === 'reuse') {
        // buildFieldPanel >> record deck or grave
        for (let field in personal.eff_queue[0].ext) {
          let card_list = personal.eff_queue[0].ext[field]
          game.buildFieldPanel(card_list)
        }
      }
	  else {		  
		if (curr_eff === 'steal' || curr_eff === 'exchange' || (curr_eff === 'teleport' && ('hand' in personal.eff_queue[0].ext))) {
          // flip opponent hand card
          for (let card of opponent.hand)
            card.flip()
            //card.flip(card.name)
            //card.img.loadTexture(card.name)
        }  
		
		// open flickerPanel here
		game.flickerPanel(true, personal.eff_queue[0].info)
		
	  }	  
      let choose_btn = game.page.game.choose
      choose_btn.reset(choose_btn.x, choose_btn.y)
    }
	
	let choose_txt = ', choose '
	for (let type in personal.eff_queue[0].info.choose) {
	  let amount = personal.eff_queue[0].info.choose[type]
	  choose_txt += `${amount} ${type}${(amount > 1)? 's' : ''} ` 
    }
	
    game.textPanel({action: `${personal.eff_queue[0].name} ${personal.eff_queue[0].eff} ${choose_txt}`})
  }
}

Player.prototype.chooseCard = function (card) {
  let flicker_panel = game.page.game.flicker_panel
  if (flicker_panel._avail && !(card.id in flicker_panel._flicker_list)) return alert('unable to choose')
  
  if (!personal.card_pick[card.id]) {
    personal.card_pick[card.id] = card

	// remove card from flicker panel
	if (flicker_panel._avail) game.phaser.world.addChild(card.body)
	else card.img.alpha = 0.5
  }
  else {
    delete personal.card_pick[card.id]
 
	// add card back to flicker panel
    if (flicker_panel._avail) flicker_panel.addChild(card.body)
	else card.img.alpha = 1
  }
}

Player.prototype.drawCard = function () {
  socket.emit('drawCard', it => {
    if (it.err) return game.textPanel({cursor: it.err})
  })
}

// for player trigger a card on field/ enchant an attack
Player.prototype.triggerCard = function (card) {
  //socket.emit('triggerCard', {id: card.id}, it => {
  socket.emit('clickCard', {id: card.id}, it => {
    if (it.err) {
      if (it.err === 'choose') personal.chooseCard(card)
      else return game.textPanel({cursor: it.err})
    }
    game.textPanel({cursor: ''})
  })
}

Player.prototype.endTurn = function () {
  socket.emit('endTurn', it => {
    if (it.err) return game.textPanel({cursor: it.err})
    /*
    game.textPanel(it.msg)
    console.log(it.card)
    if (Object.keys(it.card).length) game.cardMove(it.card)
    game.resetCardPick()
    */
  })
}

Player.prototype.leaveMatch = function () {
  socket.emit('leaveMatch')
  game.changePage({next: 'lobby'})
  game.resetPlayer()
}

Player.prototype.matchEnd = function () {
  socket.emit('matchEnd', it => {
    game.changePage({next: 'lobby'})
	game.resetPlayer()
  })
}

Player.prototype.login = function () {
  if (!$('#logAcc').val()) return game.textPanel({cursor: 'please enter your account'})
  if (!$('#logPswd').val()) return game.textPanel({cursor: 'please enter your password'})
  socket.emit('login',  { acc: $('#logAcc').val(), passwd: $('#logPswd').val() }, it => {
    if (it.err) {
      game.textPanel({cursor: it.err})
      $('#logAcc, #logPswd').val('')
      return
    }

    // init deck slot
    for (let slot in it.deck_slot) {
      let deck_name = it.deck_slot[slot].name
      personal.deck_slot[slot] = new Deck({slot: slot, name: deck_name})
      if (it.deck_slot[slot].card_list.length) {
        personal.deck_slot[slot].text.setText(deck_name)
        personal.deck_slot[slot].img.loadTexture('cardback')
        personal.deck_slot[slot].img.inputEnabled = true
        personal.deck_slot[slot].card_list = it.deck_slot[slot].card_list
      }
      game.page.match_search[`${slot}_img`] = personal.deck_slot[slot].img
      game.page.match_search[`${slot}_text`] = personal.deck_slot[slot].text
	  game.page.match_search[`${slot}_frame`] = personal.deck_slot[slot].frame
      game.page.deck_build[`${slot}_img`] = personal.deck_slot[slot].img
      game.page.deck_build[`${slot}_text`] = personal.deck_slot[slot].text
      game.page.deck_build[`${slot}_btn`] = personal.deck_slot[slot].rdm_btn
	}

    // build match search page random deck

    let rdm = new Deck({slot: 'random', name: 'random'})
    rdm.img.loadTexture('random')
    rdm.img.inputEnabled = true
    game.page.match_search.random_deck = rdm.img
	game.page.match_search.random_deck_frame = rdm.frame

    game.changePage({ next: 'lobby' })
  })
}

Player.prototype.searchMatch = function () {
  socket.emit('searchMatch', {curr_deck: (personal.curr_deck == null)? '' : personal.curr_deck.slot}, it => {
    if (it.err) return game.textPanel({cursor: it.err})
    if (it.msg) {
      game.changePage({next:'loading'})
      game.textPanel(it.msg)
    }
  })
}

Player.prototype.signUp = function () {
  if (!$('#sgnAcc').val()) return alert('please enter your account')
  if (!$('#sgnPswd').val()) return alert('please enter your password')
  if (!$('#sgnRepswd').val()) return alert('please enter your password again')
  if ($('#sgnPswd').val() !== $('#sgnRepswd').val()) return alert('passwords are different')

  socket.emit('signUp',  {acc: $('#sgnAcc').val(), passwd: $('#sgnPswd').val()}, it => {
    if (it.err) {
      alert(it.err)
      $('#sgnAcc, #sgnPswd, #sgnRepswd').val('')
      return
    }
    game.changePage({next: 'start'})
  })
}

Player.prototype.useCard = function (card) {
  //socket.emit('checkUse', {id: card.id}, it => {
  socket.emit('clickCard', {id: card.id}, it => {
    if (it.err) {
      if (it.err === 'choose') personal.chooseCard(card)
      else game.textPanel({cursor: it.err})
      return
    }
    game.textPanel({cursor: ''})
  })
}

const Deck = function (init) {
  this.slot = init.slot
  this.name = init.name
  this.card_list = []
  this.page = 1

  // deck
  this.index = (this.slot === 'random')? 4 : this.slot.split("_")[1]
  this.img = game.phaser.add.sprite((game.default.game.width-232)/2 + 84*(this.index-1), game.default.game.height/2, 'emptySlot')
  this.img.events.onInputDown.add(this.click, this)
  this.img.kill()

  this.text = game.phaser.add.text((game.default.game.width-232)/2 + 84*(this.index-1), game.default.game.height/2, '', {font: '20px Arial', fill:'#ffffff', align: 'left', stroke: '#000000', strokeThickness: 4})
  this.text.kill()

  this.rdm_btn = game.phaser.add.button((game.default.game.width-232)/2 + 84*(this.index-1), game.default.game.height/2 + 110, 'new', this.randomDeck, this)
  this.rdm_btn.kill()
  
  this.frame = game.phaser.add.sprite(this.img.x, this.img.y, 'frame')
  this.frame.req = true
  this.frame.kill()
}

Deck.prototype.click = function (){
  switch (game.curr_page) {
    case 'deck_build':
      game.changePage({ next: 'deck_view' })
      personal.curr_deck = this.slot
      game.textPanel({cursor: `${this.name}`})
      game.showTexture({init: 1})
      break

    case 'match_search':
	  if (personal.curr_deck != null) personal.curr_deck.frame.kill()	
	  this.frame.reset(this.img.x, this.img.y)
      personal.curr_deck = this//this.slot
      game.textPanel({cursor: `${this.name}`})
      break

    default: break
  }
}

Deck.prototype.randomDeck = function () {
  socket.emit('randomDeck', { slot: this.slot }, it => {
    console.log(it.newDeck)
    this.card_list = it.newDeck
    this.img.loadTexture('cardback')
    this.img.inputEnabled = true
    this.text.setText(`deck_${this.index}`)
    alert('you build a new deck')
  })
}

const Card = function (init) {
  //this.cover = init.cover
  this.name = init.name
  this.id = init.id
  this.field = init.field
  this.socket = {}
  this.curr_skt = 0
  this.bond = null
  this.owner = init.owner
  this.show_mode = false

  this.body = game.phaser.add.sprite(
    game.page.game[`${this.owner}_deck`].x,
    game.page.game[`${this.owner}_deck`].y,
    null
  )

  //this.body = game.phaser.add.sprite(0, 0, null)
  this.body.anchor.setTo(0.5, 0.5)

  this.img = game.phaser.add.sprite(0, 0, (init.cover)? 'cardback' : init.name)
  this.img.anchor.setTo(0.5, 0.5)
  this.img.inputEnabled = true

  this.img.events.onInputDown.add( function(){
    //if (this.owner === 'personal') this.click()
    this.click()
  }, this)
  this.img.events.onInputOver.add( function(){
    game.textPanel({effect: this.name})
	let x = this.body.x 
	if (this.body.x < game.default.game.width/3) x -= game.default.card.width/2
	else {
	  if (this.body.x <= game.default.game.width*2/3) x -= game.text.effect.width/2
	  else x -= (game.text.effect.width - game.default.card.width/2)
	}	
	let y = this.body.y + ((this.body.y >= game.default.game.height/2)? -1*(game.text.effect.height + game.default.card.height/2 + 5) : (game.default.card.height/2 + 5)) 
	game.text.effect.reset(x, y)	
	
	if (!this.show_mode && this.name !== 'cardback' && this.img.key === 'cardback') {
		//console.log('show', this, this.img)
		this.img.loadTexture(this.name)	
		this.show_mode = true
	}	
    game.phaser.input.mouse._last_over_scroll = this
    game.phaser.input.mouse.mouseWheelCallback = this.overScroll
  }, this)
  this.img.events.onInputOut.add( function(){
    game.textPanel({effect: 'empty'})
	if (this.show_mode && this.name !== 'cardback' && this.img.key !== 'cardback') {
		//console.log('cover', this, this.img)
		this.img.loadTexture('cardback')
		this.show_mode = false
	}
	this.curr_skt = 0
    game.phaser.input.mouse.mouseWheelCallback = null
  }, this)
  this.body.addChild(this.img)

  this.frame = game.phaser.add.sprite(0, 0, 'frame')
  this.frame.visible = false
  this.frame.anchor.setTo(0.5, 0.5)
  this.body.addChild(this.frame)
}

Card.prototype.flip = function (name = null) {
  let card = this
  if (name != null) card.name = name

  game.tween = game.phaser.add.tween(card.body.scale).to(
    {x: 0, y: 1}, 150, Phaser.Easing.Sinusoidal.InOut, true
  )
  game.tween.onComplete.add(function () {
    card.img.loadTexture((card.img.key !== 'cardback')? 'cardback' : card.name)
    game.tween = game.phaser.add.tween(card.body.scale).to(
      {x: 1, y: 1}, 150, Phaser.Easing.Sinusoidal.InOut, true
    )
  }, game.tween)

  //if (this.img.key !== 'cardback') this.img.loadTexture('cardback')
  //else {
  // this.name = name
  //  this.img.loadTexture(name)
  //}
}

Card.prototype.turn = function (state) {
  let angle = (state === 'down')? 90 : -90 
  game.tween = game.phaser.add.tween(this.body).to(
    {angle: this.body.angle + angle}, 500, Phaser.Easing.Sinusoidal.InOut, true
  )	
}

Card.prototype.overScroll = function () {
  let last = game.phaser.input.mouse._last_over_scroll

  card_id = Object.keys(last.socket)
  if (!card_id.length) return //console.log('empty')

  let last_skt = (!last.curr_skt)? card_id.length - 1 : last.curr_skt - 1
  //game.player[last.owner].socket[game.findCard({id: card_id[last_skt], curr_own: last.owner, from: 'socket'})].body.kill()
  game.player[last.owner].socket[game.findCard({id: card_id[last_skt], curr_own: last.owner, from: 'socket'})].body.visible = false

  if (game.phaser.input.mouse.wheelDelta === Phaser.Mouse.WHEEL_UP) {
    let curr = game.player[last.owner].socket[game.findCard({id: card_id[last.curr_skt], curr_own: last.owner, from: 'socket'})]
    curr.body.reset(last.body.x, game.default.player[last.owner].y.socket)
    //curr.body.angle = last.body.angle
    game.phaser.world.bringToTop(curr.body)

    if (last.curr_skt == card_id.length - 1) last.curr_skt = 0
    else last.curr_skt ++
  }
  else last.curr_skt = 0
}

Card.prototype.click = function () {
  switch (this.field) {
    case 'altar':
      personal.triggerCard(this)
      break

    case 'battle':
      personal.triggerCard(this)
      break

    case 'socket':
      //personal.chooseCard(this)
      personal.useCard(this)
      break

    case 'grave' :
      break

    case 'hand'	 :
      personal.useCard(this)
      break

    case 'life'	 :
      //game.textPanel({cursor: this.name})
      personal.useCard(this)
      break

    default			 : break
  }
}

////////////////////////////////////////////////////////////////////////////////////

// utility

function buildList (obj) {
  let rlt = {}
  for (let id in obj) {
    rlt[id] = {}
  }
  game.resetCardPick()
  return rlt
}

function fadeVolIn (last_percent, max_volume_percent, total_time, step) {
  if (last_percent < max_volume_percent) {
	$('audio')[0].volume = last_percent/100
    setTimeout(`fadeVolIn((${last_percent + step}, ${max_volume_percent}, ${total_time}, ${step}))`, total_time/max_volume_percent)
  }
}

function fadeVolOut (last_percent, min_volume_percent, total_time, step) {
  if (last_percent > min_volume_percent) {
	$('audio')[0].volume = last_percent/100
    setTimeout(`fadeVolOut((${last_percent - step}, ${min_volume_percent}, ${total_time}, ${step}))`, total_time/last_percent)
  }
}

///////////////////////////////////////////////////////////////////////////////////

// socket server

socket.on('gameStart', it => {
  // record deck
  // personal.record_deck = it.card_list.deck
  game.backgroundPanel(it.start)
  
  // build life
  for (let target in it.card_list.life){
    for(let card of it.card_list.life[target]){
      let name = (card.name)? card.name : 'cardback'
      let input = (target === 'personal')? true : false
      game.player[target].life.push(new Card({name: name, id: card.id, cover: true, field: 'life', owner: target}))
    }
  }
  
  // build hand
  for (let target in it.card_list.hand){
    for(let card of it.card_list.hand[target]){
      let name = (card.name)? card.name : 'cardback'
      let input = (target === 'personal')? true : false
      game.player[target].hand.push(new Card({name: name, id: card.id, cover: (input)? false : true, field: 'hand', owner: target}))
    }
  }

  game.fixCardPos({personal: {life: true, hand: true}, opponent: {life: true, hand: true}})
  game.changePage({next: 'game'})
  game.textPanel(it.msg)
  game.attrPanel(it.attr)
  
  for (let type in game.text) {
	game.phaser.world.bringToTop(game.text[type])  
  }
  game.phaser.world.bringToTop(game.page.game.stat_panel)
  game.actionReminder('game_start')
})

socket.on('playerCounter', it => {
  console.log(it.card)
  game.resetCardPick()
  game.textPanel(it.msg)
  if ('card' in it) game.cardMove(it.card)
  if ('turn_dn' in it) {
	let card = game.player[it.turn_dn.curr_own][it.turn_dn.from][game.findCard(it.turn_dn)]
	card.turn('down')
    //game.tween = game.phaser.add.tween(card.body).to(
    //  {angle: card.body.angle + 90}, 500, Phaser.Easing.Sinusoidal.InOut, true
    //)  
  }
  //game.counterPanel(it.rlt)
})

socket.on('playerPass', it => {
  game.resetCardPick()
  game.textPanel(it.msg)
  game.cardMove(it.card)
  //game.counterPanel(it.rlt)
})

socket.on('playerAttack', it => {
  if (it.rlt.opponent) game.actionReminder('attack_start')
  game.textPanel(it.msg)
  game.attackPanel(it.rlt)
  game.attrPanel(it.attr)
  console.log(it)
})

socket.on('playerGiveUp', it => {
  if (it.rlt.opponent) game.actionReminder('give_up')
  game.resetCardPick()
  game.textPanel(it.msg)
  if ('card' in it) game.cardMove(it.card)
  game.attackPanel(it.rlt)
})

socket.on('plyUseVanish', it => {
  if (it.rlt.opponent) game.actionReminder('conceal_tracking')
  game.textPanel(it.msg)
  game.cardMove(it.card)
  game.attackPanel(it.rlt)
})

socket.on('playerTrigger', it => {
  game.textPanel(it.msg)
  game.resetCardPick()
  if (it.rlt) {
    //game.player[it.card.curr_own][it.card.from][game.findCard(it.card)].body.angle += 90
    let card = game.player[it.card.curr_own][it.card.from][game.findCard(it.card)]
	card.turn('down')
    //game.tween = game.phaser.add.tween(card.body).to(
    //  {angle: card.body.angle + 90}, 500, Phaser.Easing.Sinusoidal.InOut, true
    //)
    if (it.foe) personal.pass()
    //game.counterPanel(it.rlt)
  }
  else {
    game.cardMove(it.card)
  }
})

socket.on('plyDrawCard', it => {
  game.textPanel(it.msg)
  game.attrPanel(it.attr)

  let fix_field = {}
  for (let id in it.card) {
    let curr = it.card[id]
    game.player[curr.new_own].hand.push( new Card({name: (curr.name)? curr.name : 'cardback', id: id, cover: (curr.cover)? curr.cover : (false), owner: curr.new_own, field: curr.to}) )
    if (curr.deck_empty) game.page.game[`${curr.new_own}_deck`].kill()
    if (!fix_field[curr.new_own]) fix_field[curr.new_own] = {hand: true}
  }
  game.fixCardPos(fix_field)
})

socket.on('plyUseCard', it => {
  console.log(it)
  game.cardMove(it.card)
  game.textPanel(it.msg)
  game.attrPanel(it.attr)
  if (it.foe) {
    personal.pass()
    //game.page.game.counter.reset(game.page.game.counter.x, game.page.game.counter.y)
    //game.page.game.pass.reset(game.page.game.pass.x, game.page.game.pass.y)
  }
})

socket.on('attrAdjust', it => {
  game.attrPanel(it.attr)
})

socket.on('interrupt', it => {
  game.textPanel({phase: ' ', action: ' ', cursor: ' '})
  game.changePage({next: 'lobby'})
  game.resetPlayer()
  alert(it.err)
})

socket.on('turnShift', it => {
  //console.log(it.card)
  if (it.start) game.actionReminder('turn_shift')
  game.textPanel(it.msg)
  game.attrPanel(it.attr)
  if (Object.keys(it.card).length) game.cardMove(it.card)
	  
  game.backgroundPanel(it.start)
  game.resetCardPick()
})

// card effects
socket.on('effectTrigger', effect => {
  console.log(effect)

  // attr
  game.attrPanel(effect.attr)  
  
  // card
  for (let type in effect.card) {
    switch (type) {
      // card flip
	  case 'unveil':
		let upd = effect.card[type]
		if (Object.keys(upd).length) {
		  for (let card of game.player.opponent.hand) {
            card.name = upd[card.id]
			card.flip()
		  }
	    }
		break
		
      case 'receive':
      case 'heal':
      case 'bleed':
        let target = (Object.keys(effect.card[type].personal).length)? 'personal' : 'opponent'
		let field = (type === 'receive' || type === 'heal' || type === 'bleed')? 'life' : 'hand'
        for (let id in effect.card[type][target]) {
          let pos = game.findCard({id: id, curr_own: target, from: field})
          game.player[target][field][pos].flip(effect.card[type][target][id])
        }
        break

      // generate new card
	  case 'modify':
      case 'retrieve':
      case 'draw':
        if (type === 'retrieve') {
          let field_panel = game.page.game.field_panel
          field_panel.removeChildren(begin = 0)
          field_panel.kill()
        }
        if (type === 'draw' || type === 'retrieve' || type === 'modify') {
		  let fix_field = {}
		  let tg = (Object.keys(effect.card[type].personal).length)? 'personal' : 'opponent'
		  for (let id in effect.card[type][tg]) {
		    let curr = effect.card[type][tg][id]
		    game.player[curr.new_own][curr.to].push( new Card({name: (curr.name)? curr.name : 'cardback', id: id, cover: (curr.cover)? curr.cover : (false), owner: curr.new_own, field: curr.to}) )
		    if (curr.deck_empty) game.page.game[`${curr.new_own}_deck`].kill()
		    if (!fix_field[curr.new_own]) fix_field[curr.new_own] = {[curr.to]: true}
		  }
		  game.fixCardPos(fix_field)
		}
        break

      // flip hand card back
	  case 'teleport':
	  case 'reuse':
      case 'recall':
	  case 'exchange':
      case 'steal':
        if (type === 'steal' || type === 'exchange') {
		  if (Object.keys(effect.card[type].personal).length) {
            for (let card of opponent.hand)
              if (!(card.id in effect.card[type].personal)) card.flip()
              //card.img.loadTexture('cardback')
		  }
        }
		else if (type === 'recall' || type === 'reuse') {
		  let field_panel = game.page.game.field_panel
          field_panel.removeChildren(begin = 0)
          field_panel.kill()
		}
		else if (type === 'teleport') {
		  // flip back all choosable cards
		  let _tmp = effect.card[type].personal
		  if (Object.keys(_tmp).length) {
			let first_card = _tmp[Object.keys(_tmp)[0]]
			if (first_card.to !== 'hand' && first_card.from === 'hand' && !opponent.stat.unveil.status) {
			  for (let card of opponent.hand)
                if (!(card.id in effect.card[type].personal)) card.flip()
		    }
		  }		
		}

      // card move or turn
      default:
        for (let target in effect.card[type]) {	
		
		  // !-- only cards on battle can do turn or flip(magnet teleport artifact back tp hand)
          for (let id in effect.card[type][target]) {
			if (effect.card[type][target][id].from !== 'battle') continue  
			
			// find card
            let curr = effect.card[type][target][id]
			let pos = game.findCard({id: id, curr_own: curr.curr_own/*target*/, from: 'battle'})
			card = game.player[curr.curr_own/*target*/].battle[pos]
            
			// do flip
			/*
			if (curr.new_own === 'opponent') {
			  if (!opponent.stat.unveil.status && curr.to === 'hand') card.flip()		  
			}
		    */
			
			// do turn
			if ('turn' in curr) {   
              card.turn(curr.turn)			  
			  // if card only needs to turn, then delete it
			  if (!('to' in curr)) delete effect.card[type][target][id]
            }
          }
		  
		  // card moving
          if (Object.keys(effect.card[type][target]).length)
            game.cardMove(effect.card[type][target])
        }
		
        break
    }
  }

  // stat
  game.statPanel(effect.stat)
})

socket.on('effectLoop', effect => {
  console.log(effect)	
	
  // update covered card name
  if (effect.rlt.ext) {
    for (let field in effect.rlt.ext) {
      let upd = effect.rlt.ext[field]
      if (field !== 'deck') {
        for (let card of opponent[field])
          card.name = upd[card.id]
      }
    }
  }

  // effect queue
  personal.eff_queue.push(effect.rlt)
  if (personal.eff_queue.length == 1) personal.effectLoop()
})

socket.on('phaseShift', it => {
  game.textPanel(it.msg)
})

socket.on('chooseOne', it => {
  game.textPanel(it.msg)
  game.choosePanel(it)
})

socket.on('chantingTrigger', it => {
  game.cardMove(it.card)
})

socket.on('gameOver', it => {
  // game over panel
  game.actionReminder('game_over')
  
  let end_panel = game.page.game.end_match
  end_panel.reset(game.default.game.width/2, game.default.game.height/2)
  game.phaser.world.bringToTop(end_panel)

  // game over text
  game.textPanel(it.msg)
})

socket.on('chatMode', it => {
  alert(it.msg)
})

//////////////////////////////////////////////////////////////////////////////////////

// game initialization
const game = new Game()
const personal = game.player.personal
const opponent = game.player.opponent
const setting_panel = {leave: null}

socket.emit('preload', res => {
  game.phaser = new Phaser.Game(game.default.game.width, game.default.game.height, Phaser.HEADLESS/*Phaser.Canvas*/, 'game', {
    create: () => {
	  let percentage = Math.round(window.devicePixelRatio * 100)
	  let fixed_position = `${percentage}%`
      $('#game').css({width: fixed_position, height: fixed_position})
	  $('#opponent').css({width: fixed_position, top: `${(100-percentage)/2 - 6}%`})
	  $('#personal').css({width: fixed_position, top: `${percentage + (100-percentage)/2}%`})// + 0.5}%`})
	  $('#chat_input input').css({width: fixed_position, top: `calc(${percentage + (100-percentage)/2 + 6}%)`})
	  
      game.phaser.add.sprite(0, 0, 'background')
	  game.phaser.scale.setGameSize(window.screen.width, window.screen.width/game.default.game.width*game.default.game.height)
	  game.phaser.world.scale.setTo(window.screen.width/game.default.game.width, window.screen.width/game.default.game.width)	  
	  
      // init text
      game.text_group = game.phaser.add.group()
      for (let type in game.text) {
        let text = ''
        let init = game.text[type].init//{font: "26px Arial", fill: '#ffffff', align: 'left'}
        let x = game.text[type].x + ((type !== 'effect')? 15 : -15)//(type === 'effect')? 21 + 12 + 18 : 21 + 12
        let y = game.default.game.height/2 + game.default.text[type]/game.default.scale
        if (type === 'effect' || type === 'stat') {
          init.backgroundColor = 'rgba(255,255,255,0.9)'
          init.fill = '#000000'
        }
        game.text[type] = game.phaser.add.text(x, y, text, init)
        if (type === 'effect') game.text_group.add(game.text[type])
        if (type === 'end') {
		  game.text[type].anchor.setTo(0.5)
          game.text[type].addColor('#6e6e6e', 0)
		}
	  }

      // init
      socket.emit('init', it => {
        // card effect init
        for (let name in it.eff) it.eff[name] = it.eff[name].text
        Object.assign(game.card_eff, it.eff)

        // player stat init
        for (let ply in game.player) {
          for (let name in it.stat) {
            game.player[ply].stat[name] = {img: game.phaser.add.sprite(0, 0, name), text: it.stat[name], status: false}
            game.player[ply].stat[name].img.anchor.setTo(0.5, 0.5)
            game.player[ply].stat[name].img.inputEnabled = true
            game.player[ply].stat[name].img.events.onInputOver.add(function(){
			  game.textPanel({stat: game.player[ply].stat[name].text})
			  let x = game.player[ply].stat[name].img.x + 10
			  let y = game.player[ply].stat[name].img.y + 384 + ((game.player[ply].stat[name].img.y + 384 >= game.default.game.height/2)? -1*(game.text.effect.height+20) : 20)
			  game.text.effect.reset(x, y)
			}, this)
            game.player[ply].stat[name].img.events.onInputOut.add(function(){game.textPanel({effect: 'empty'})}, this)
            game.player[ply].stat[name].img.kill()
          }
        }

        // page init
        game.pageInit()
		
		// sound init -- phaser method
		//game.soundInit()
      })

      // stat panel
      //game.page.game.stat_panel = game.phaser.add.sprite(-15, game.default.game.height/2, 'stat')
	  game.page.game.stat_panel = game.phaser.add.sprite(25, game.default.game.height/2, 'stat')
      game.page.game.stat_panel.inputEnabled = true
      //game.page.game.stat_panel.events.onInputDown.add(function(){ game.showStat() }, this)
      //game.page.game.stat_panel.addChild(game.text_group)

    },
    preload: () => {
      for (let type in res) {
        for (let elem in res[type]) {
		  if (type !== 'audio') game.phaser.load[type](elem, res[type][elem])
		  else game.sfx[elem] = res[type][elem]
		}
	  }
	},
    render: () => {},
    update: () => {}
  })
})

$(document).ready(() => {
  // scroll event
  $(window).resize((event) => {
	let percentage = Math.round(window.devicePixelRatio * 100)
	let fixed_position = `${percentage}%`
    $('#game').css({width: fixed_position, height: fixed_position})
	$('#opponent').css({width: fixed_position, top: `${(100-percentage)/2 - 6}%`})
	$('#personal').css({width: fixed_position, top: `${percentage + (100-percentage)/2}%`})// + 0.5}%`})
	$('#chat_input input').css({width: fixed_position, top: `calc(${percentage + (100-percentage)/2 + 6}%)`})
  })
  
  // keydown event
  $('body').keydown( () => {		
	let key_number = event.which
	//console.log(key_number, event.ctrlKey)
	
	// ENTER keydown
	if (key_number == 13) {			
	  event.preventDefault()
	  
	  /*
	  if (event.ctrlKey) { // show hide text area
		if ($('#chat_input input').css('visibility') === 'hidden') {
		  $('#chat_input input').css({visibility: 'visible'})
		  $('#chat_input input')[0].focus()
		}
		else {
		  $('#chat_input input')[0].blur()
		  $('#chat_input input').css({visibility: 'hidden'})
	    }
	  }
	  else { // send msg
		if ($('#chat_input input').css('visibility') !== 'hidden') {
		  $('#chat_input input')[0].value = ''
		  $('#chat_input input')[0].focus()
	    }
	  }
	  */
	  if ($('#chat_input input').is(':focus')) {
		if ($('#chat_input input').val() !== '') {
		  socket.emit('chatMode', {msg: $('#chat_input input').val()})
		  $('#chat_input input').val('') 
	    }
	  }
	  else {
		$('#chat_input input')[0].focus()
	  }
	}
  })
})