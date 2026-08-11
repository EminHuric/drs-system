// ─────────────────────────────────────────────────────────────
//  Gotovi meniji za brz start
//
//  Prazan meni je najgori prvi utisak — vlasnik ne zna odakle da
//  krene. Zato nudimo tri šablona koje posle menja kako hoće:
//  briše, preimenuje, menja cene. Ništa ovde nije zaključano.
// ─────────────────────────────────────────────────────────────

export const TEMPLATES = {
  restoran: {
    label: 'Restoran / konoba',
    icon: '🍽️',
    desc: 'Predjela, roštilj, riba, salate, dezerti i pića.',
    categories: [
      {
        name: 'Predjela',
        emoji: '🫒',
        items: [
          { name: 'Pršut i sir', price: 9.5, emoji: '🧀', desc: 'Njeguški pršut, kozji sir, masline, domaći hleb' },
          { name: 'Bruskete s paradajzom', price: 5.5, emoji: '🍅', desc: 'Tostiran hleb, svež paradajz, bosiljak, beli luk' },
          { name: 'Pohovani kačkavalj', price: 6.5, emoji: '🧀', desc: 'Hrskavi pohovani sir uz tartar sos' },
        ],
      },
      {
        name: 'Roštilj',
        emoji: '🔥',
        items: [
          { name: 'Ćevapi u lepinji', price: 8.5, emoji: '🥙', desc: '10 komada, kajmak, luk, domaća lepinja', badges: ['bestseller'] },
          { name: 'Punjena pljeskavica', price: 9, emoji: '🍔', desc: 'Punjena sirom i pršutom, prilog po izboru' },
          { name: 'Pileći ražnjići', price: 8, emoji: '🍢', desc: 'Marinirana piletina sa žara, pomfrit' },
          { name: 'Mešano meso za dvoje', price: 18.5, emoji: '🍖', desc: 'Ćevapi, pljeskavica, ražnjići, kobasica, prilozi', badges: ['chef'] },
        ],
      },
      {
        name: 'Riba i plodovi mora',
        emoji: '🐟',
        items: [
          { name: 'Orada sa žara', price: 16, emoji: '🐟', desc: 'Sveža orada, blitva s krompirom, limun' },
          { name: 'Lignje na žaru', price: 13.5, emoji: '🦑', desc: 'Beli luk, peršun, maslinovo ulje' },
          { name: 'Crni rižoto', price: 14, emoji: '🍚', desc: 'Rižoto od sipe sa parmezanom' },
        ],
      },
      {
        name: 'Salate',
        emoji: '🥗',
        items: [
          { name: 'Šopska salata', price: 4.5, emoji: '🥗', desc: 'Paradajz, krastavac, paprika, sir' },
          { name: 'Cezar salata', price: 8.5, emoji: '🥬', desc: 'Piletina, zelena salata, parmezan, krutoni' },
          { name: 'Grčka salata', price: 5.5, emoji: '🫒', desc: 'Feta, masline, origano', badges: ['vegan'] },
        ],
      },
      {
        name: 'Dezerti',
        emoji: '🍰',
        items: [
          { name: 'Palačinke', price: 4.5, emoji: '🥞', desc: 'Nutela, džem ili med sa orasima' },
          { name: 'Baklava', price: 4, emoji: '🍯', desc: 'Domaća baklava sa orasima', badges: ['house'] },
        ],
      },
      {
        name: 'Pića',
        emoji: '🥤',
        items: [
          { name: 'Domaća limunada', price: 3.5, emoji: '🍋', desc: 'Sveže ceđen limun, nana, med' },
          { name: 'Coca-Cola', price: 2.5, emoji: '🥤', desc: '0,33 l' },
          { name: 'Kisela voda', price: 2, emoji: '💧', desc: '0,5 l' },
          { name: 'Točeno pivo', price: 3, emoji: '🍺', desc: '0,5 l' },
          { name: 'Espresso', price: 1.5, emoji: '☕', desc: 'Domaća pržiona' },
        ],
      },
    ],
  },

  kafic: {
    label: 'Kafić / bar',
    icon: '☕',
    desc: 'Topli napici, sokovi, pivo, vino i slatko.',
    categories: [
      {
        name: 'Topli napici',
        emoji: '☕',
        items: [
          { name: 'Espresso', price: 1.5, emoji: '☕', desc: '' },
          { name: 'Macchiato', price: 1.8, emoji: '☕', desc: '' },
          { name: 'Cappuccino', price: 2.2, emoji: '☕', desc: '', badges: ['bestseller'] },
          { name: 'Topla čokolada', price: 2.5, emoji: '🍫', desc: '' },
          { name: 'Čaj', price: 1.8, emoji: '🍵', desc: 'Nana, kamilica, šumsko voće' },
        ],
      },
      {
        name: 'Hladni napici',
        emoji: '🧊',
        items: [
          { name: 'Ledena kafa', price: 3, emoji: '🧋', desc: '' },
          { name: 'Domaća limunada', price: 3, emoji: '🍋', desc: 'Nana i med' },
          { name: 'Ceđena pomorandža', price: 3.5, emoji: '🍊', desc: '0,3 l' },
          { name: 'Coca-Cola', price: 2.5, emoji: '🥤', desc: '0,25 l' },
          { name: 'Voda', price: 1.5, emoji: '💧', desc: '0,5 l' },
        ],
      },
      {
        name: 'Alkohol',
        emoji: '🍷',
        items: [
          { name: 'Točeno pivo', price: 3, emoji: '🍺', desc: '0,5 l' },
          { name: 'Flaširano pivo', price: 2.8, emoji: '🍻', desc: '0,33 l' },
          { name: 'Čaša vina', price: 3.5, emoji: '🍷', desc: 'Crno ili belo, 0,15 l' },
          { name: 'Rakija', price: 2.5, emoji: '🥃', desc: 'Loza, kruška, dunja' },
        ],
      },
      {
        name: 'Uz kafu',
        emoji: '🍰',
        items: [
          { name: 'Kroasan', price: 2, emoji: '🥐', desc: 'Puter, čokolada ili džem' },
          { name: 'Parče torte', price: 3.5, emoji: '🍰', desc: 'Pitajte konobara za dnevnu ponudu' },
        ],
      },
    ],
  },

  dostava: {
    label: 'Picerija / fast food',
    icon: '🍕',
    desc: 'Pizza, burgeri, prilozi i pića — spremno za dostavu.',
    categories: [
      {
        name: 'Pizza',
        emoji: '🍕',
        items: [
          { name: 'Margherita', price: 7, emoji: '🍕', desc: 'Pelat, mocarela, bosiljak' },
          { name: 'Capricciosa', price: 8.5, emoji: '🍕', desc: 'Pelat, mocarela, šunka, pečurke', badges: ['bestseller'] },
          { name: 'Quattro formaggi', price: 9.5, emoji: '🧀', desc: 'Četiri vrste sira, pavlaka' },
          { name: 'Vegetariana', price: 8, emoji: '🥦', desc: 'Sezonsko povrće', badges: ['vegan'] },
        ],
      },
      {
        name: 'Burgeri',
        emoji: '🍔',
        items: [
          { name: 'Klasik burger', price: 6.5, emoji: '🍔', desc: 'Junetina 180 g, čedar, salata, sos' },
          { name: 'Ljuti burger', price: 7.5, emoji: '🌶️', desc: 'Jalapeño, ljuti sos', badges: ['spicy'] },
          { name: 'Pileći burger', price: 6.5, emoji: '🍗', desc: 'Hrskava piletina, kupus, majonez' },
        ],
      },
      {
        name: 'Prilozi',
        emoji: '🍟',
        items: [
          { name: 'Pomfrit', price: 2.5, emoji: '🍟', desc: 'Velika porcija' },
          { name: 'Pohovani luk', price: 3, emoji: '🧅', desc: '' },
          { name: 'Sos po izboru', price: 0.8, emoji: '🥫', desc: 'Kečap, majonez, ljuti, beli luk' },
        ],
      },
      {
        name: 'Pića',
        emoji: '🥤',
        items: [
          { name: 'Coca-Cola', price: 2.2, emoji: '🥤', desc: '0,5 l' },
          { name: 'Voda', price: 1.5, emoji: '💧', desc: '0,5 l' },
          { name: 'Pivo', price: 2.5, emoji: '🍺', desc: '0,5 l' },
        ],
      },
    ],
  },
}
