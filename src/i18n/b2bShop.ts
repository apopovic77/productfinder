/**
 * Texte der B2B-Shop-Funktionen (Alex 26.11.2026: Bundles, Sofort verfügbar /
 * Sonderangebote / Neu eingetroffen, Vororder, Aufträge & Rechnungen, Konto).
 * Gleiche Sprachen wie ui.ts; fehlt eine, gilt Englisch.
 */
import { uiLang } from './ui';

const de = {
  menuInStock: 'Sofort verfügbar',
  menuSpecial: 'Sonderangebote',
  menuNew: 'Neu eingetroffen',
  menuBundles: 'Bundles',
  menuPreorder: 'Vororder',
  menuOrders: 'Offene Aufträge & Lieferstatus',
  menuInvoices: 'Rechnungen & offene Posten',
  menuAccount: 'Mein Konto & Umsatz',
  filterSection: 'Sortiment',
  accountSection: 'Konto',
  tabOrders: 'Aufträge',
  tabInvoices: 'Rechnungen',
  tabAccount: 'Konto',
  tabBundles: 'Bundles',
  tabPreorder: 'Vororder',
  title: 'B2B-Shop',
  loading: 'Lädt …',
  refresh: 'Aktualisieren',
  asOf: (d: string) => `Stand ${d}`,
  error: 'Die Daten konnten nicht geladen werden.',
  none: 'Keine Einträge.',
  showOpen: 'Offene',
  showAll: 'Alle (24 Monate)',
  more: 'Mehr laden',
  order: 'Auftrag',
  yourRef: (r: string) => `Ihre Nr. ${r}`,
  orderStatus: { open: 'Offen', partially_delivered: 'Teilgeliefert', completed: 'Erledigt', cancelled: 'Storniert' } as Record<string, string>,
  preorder: 'Vororder',
  online: 'online',
  requested: 'Wunschtermin',
  confirmed: 'Bestätigt',
  openQty: (n: number) => `${n} Stk. offen`,
  colArticle: 'Art.-Nr.',
  colName: 'Artikel',
  colQty: 'Bestellt',
  colDelivered: 'Geliefert',
  colOpen: 'Offen',
  colPrice: 'Preis',
  colDate: 'Termin',
  parcels: 'Pakete',
  invoices: 'Rechnungen',
  invoice: 'Rechnung',
  invoiceStatus: { open: 'Offen', overdue: 'Überfällig', paid: 'Bezahlt' } as Record<string, string>,
  due: (d: string) => `fällig ${d}`,
  paidOn: (d: string) => `bezahlt ${d}`,
  dunning: (n: number) => `Mahnstufe ${n}`,
  openSum: 'Offene Posten',
  overdueSum: 'davon überfällig',
  customerClass: 'Kundenklasse / Rabattgruppe',
  revenue: 'Umsatz netto',
  fiscalYear: (y: number) => `Geschäftsjahr ${y}`,
  invoicesCount: (n: number) => `${n} Rechnungen`,
  addresses: 'Lieferadressen',
  contacts: 'Ansprechpartner',
  changeInShop: 'Daten ändern im B2B-Shop ↗',
  bundlePrice: 'Bundle-Preis',
  rrp: 'UVP',
  dealer: 'EK',
  addBundle: 'Bundle in den Warenkorb',
  bundleAdded: '✓ Im Warenkorb',
  notInFinder: 'nicht im Finder',
  bundleHint: 'Der Bundle-Preis gilt laut B2B-Shop. Die Bundle-Nummer geht als Anmerkung mit der Bestellung; der Shop berechnet den Preis.',
  stock: (n: number) => (n > 0 ? `${n} auf Lager` : 'nicht auf Lager'),
  preorderIntro: 'Vororder-Sortiment in der Reihenfolge des B2B-Shops. Eine Gruppe öffnen, Mengen in den Warenkorb legen, dann im Checkout „Vororder“ mit Wunschtermin wählen.',
  preorderStart: 'Vororder-Bestellung starten',
  preorderActive: 'Vororder-Modus aktiv: der Checkout ist auf Vororder gestellt.',
  products: (n: number) => `${n} Produkte`,
  show: 'Zeigen',
  specialPrice: 'Sonderpreis',
  specialHint: 'von weiteren Rabatten ausgeschlossen',
  newArrival: (d: string) => `Neu eingetroffen ${d}`,
  bundleNote: (list: string) => `Bundles: ${list}`,
};

export type B2BShopTexts = typeof de;

const en: B2BShopTexts = {
  ...de,
  menuInStock: 'In stock now', menuSpecial: 'Special offers', menuNew: 'New arrivals', menuBundles: 'Bundles',
  menuPreorder: 'Pre-order', menuOrders: 'Open orders & delivery status', menuInvoices: 'Invoices & open items',
  menuAccount: 'My account & revenue', filterSection: 'Range', accountSection: 'Account',
  tabOrders: 'Orders', tabInvoices: 'Invoices', tabAccount: 'Account', tabBundles: 'Bundles', tabPreorder: 'Pre-order',
  title: 'B2B shop', loading: 'Loading …', refresh: 'Refresh', asOf: d => `As of ${d}`,
  error: 'The data could not be loaded.', none: 'No entries.', showOpen: 'Open', showAll: 'All (24 months)', more: 'Load more',
  order: 'Order', yourRef: r => `Your no. ${r}`,
  orderStatus: { open: 'Open', partially_delivered: 'Partly delivered', completed: 'Completed', cancelled: 'Cancelled' },
  preorder: 'Pre-order', online: 'online', requested: 'Requested', confirmed: 'Confirmed', openQty: n => `${n} pcs open`,
  colArticle: 'Item no.', colName: 'Item', colQty: 'Ordered', colDelivered: 'Delivered', colOpen: 'Open', colPrice: 'Price',
  colDate: 'Date', parcels: 'Parcels', invoices: 'Invoices', invoice: 'Invoice',
  invoiceStatus: { open: 'Open', overdue: 'Overdue', paid: 'Paid' }, due: d => `due ${d}`, paidOn: d => `paid ${d}`,
  dunning: n => `Reminder level ${n}`, openSum: 'Open items', overdueSum: 'of which overdue',
  customerClass: 'Customer class / discount group', revenue: 'Net revenue', fiscalYear: y => `Fiscal year ${y}`,
  invoicesCount: n => `${n} invoices`, addresses: 'Delivery addresses', contacts: 'Contacts',
  changeInShop: 'Change data in the B2B shop ↗', bundlePrice: 'Bundle price', rrp: 'RRP', dealer: 'Dealer',
  addBundle: 'Add bundle to cart', bundleAdded: '✓ In cart', notInFinder: 'not in the finder',
  bundleHint: 'Bundle price as per the B2B shop. The bundle number is sent as a note with the order; the shop calculates the price.',
  stock: n => (n > 0 ? `${n} in stock` : 'out of stock'),
  preorderIntro: 'Pre-order range in the order of the B2B shop. Open a group, put quantities in the cart, then choose “Pre-order” with a requested date at checkout.',
  preorderStart: 'Start pre-order', preorderActive: 'Pre-order mode on: checkout is set to pre-order.',
  products: n => `${n} products`, show: 'Show', specialPrice: 'Special price', specialHint: 'excluded from further discounts',
  newArrival: d => `New arrival ${d}`, bundleNote: list => `Bundles: ${list}`,
};

const fr: B2BShopTexts = {
  ...en,
  menuInStock: 'Disponible immédiatement', menuSpecial: 'Offres spéciales', menuNew: 'Nouveaux arrivages',
  menuPreorder: 'Précommande', menuOrders: 'Commandes ouvertes & livraison', menuInvoices: 'Factures & postes ouverts',
  menuAccount: 'Mon compte & chiffre d’affaires', filterSection: 'Assortiment', accountSection: 'Compte',
  tabOrders: 'Commandes', tabInvoices: 'Factures', tabAccount: 'Compte', tabPreorder: 'Précommande',
  title: 'Boutique B2B', loading: 'Chargement …', refresh: 'Actualiser', asOf: d => `État au ${d}`,
  error: 'Les données n’ont pas pu être chargées.', none: 'Aucune entrée.', showOpen: 'Ouvertes', showAll: 'Toutes (24 mois)',
  more: 'Charger plus', order: 'Commande', yourRef: r => `Votre n° ${r}`,
  orderStatus: { open: 'Ouverte', partially_delivered: 'Livrée en partie', completed: 'Terminée', cancelled: 'Annulée' },
  preorder: 'Précommande', requested: 'Date souhaitée', confirmed: 'Confirmée', openQty: n => `${n} pcs en attente`,
  colArticle: 'Réf.', colName: 'Article', colQty: 'Commandé', colDelivered: 'Livré', colOpen: 'En attente', colPrice: 'Prix',
  colDate: 'Date', parcels: 'Colis', invoices: 'Factures', invoice: 'Facture',
  invoiceStatus: { open: 'Ouverte', overdue: 'En retard', paid: 'Payée' }, due: d => `échéance ${d}`, paidOn: d => `payée ${d}`,
  dunning: n => `Niveau de relance ${n}`, openSum: 'Postes ouverts', overdueSum: 'dont en retard',
  customerClass: 'Classe client / groupe de remise', revenue: 'Chiffre d’affaires net', fiscalYear: y => `Exercice ${y}`,
  invoicesCount: n => `${n} factures`, addresses: 'Adresses de livraison', contacts: 'Interlocuteurs',
  changeInShop: 'Modifier dans la boutique B2B ↗', bundlePrice: 'Prix du bundle', rrp: 'PVC', dealer: 'Revendeur',
  addBundle: 'Ajouter le bundle au panier', bundleAdded: '✓ Dans le panier', notInFinder: 'absent du finder',
  bundleHint: 'Prix du bundle selon la boutique B2B. Le numéro du bundle est transmis en remarque ; la boutique calcule le prix.',
  stock: n => (n > 0 ? `${n} en stock` : 'pas en stock'),
  preorderIntro: 'Assortiment de précommande dans l’ordre de la boutique B2B. Ouvrez un groupe, ajoutez les quantités au panier, puis choisissez « Précommande » avec une date souhaitée.',
  preorderStart: 'Démarrer la précommande', preorderActive: 'Mode précommande actif : le checkout est réglé sur précommande.',
  products: n => `${n} produits`, show: 'Afficher', specialPrice: 'Prix spécial', specialHint: 'exclu de toute autre remise',
  newArrival: d => `Nouvel arrivage ${d}`,
};

const it: B2BShopTexts = {
  ...en,
  menuInStock: 'Disponibile subito', menuSpecial: 'Offerte speciali', menuNew: 'Nuovi arrivi', menuPreorder: 'Preordine',
  menuOrders: 'Ordini aperti & spedizione', menuInvoices: 'Fatture & partite aperte', menuAccount: 'Il mio conto & fatturato',
  filterSection: 'Assortimento', accountSection: 'Conto',
  tabOrders: 'Ordini', tabInvoices: 'Fatture', tabAccount: 'Conto', tabPreorder: 'Preordine',
  title: 'Shop B2B', loading: 'Caricamento …', refresh: 'Aggiorna', asOf: d => `Aggiornato al ${d}`,
  error: 'Impossibile caricare i dati.', none: 'Nessuna voce.', showOpen: 'Aperti', showAll: 'Tutti (24 mesi)',
  more: 'Carica altri', order: 'Ordine', yourRef: r => `Vostro n. ${r}`,
  orderStatus: { open: 'Aperto', partially_delivered: 'Consegnato in parte', completed: 'Evaso', cancelled: 'Annullato' },
  preorder: 'Preordine', requested: 'Data richiesta', confirmed: 'Confermata', openQty: n => `${n} pz aperti`,
  colArticle: 'Cod.', colName: 'Articolo', colQty: 'Ordinato', colDelivered: 'Consegnato', colOpen: 'Aperto', colPrice: 'Prezzo',
  colDate: 'Data', parcels: 'Pacchi', invoices: 'Fatture', invoice: 'Fattura',
  invoiceStatus: { open: 'Aperta', overdue: 'Scaduta', paid: 'Pagata' }, due: d => `scadenza ${d}`, paidOn: d => `pagata ${d}`,
  dunning: n => `Livello sollecito ${n}`, openSum: 'Partite aperte', overdueSum: 'di cui scadute',
  customerClass: 'Classe cliente / gruppo sconto', revenue: 'Fatturato netto', fiscalYear: y => `Esercizio ${y}`,
  invoicesCount: n => `${n} fatture`, addresses: 'Indirizzi di consegna', contacts: 'Referenti',
  changeInShop: 'Modifica dati nello shop B2B ↗', bundlePrice: 'Prezzo bundle', rrp: 'Prezzo consigliato', dealer: 'Rivenditore',
  addBundle: 'Bundle nel carrello', bundleAdded: '✓ Nel carrello', notInFinder: 'non nel finder',
  bundleHint: 'Prezzo bundle secondo lo shop B2B. Il numero del bundle viene inviato come nota; lo shop calcola il prezzo.',
  stock: n => (n > 0 ? `${n} in magazzino` : 'non disponibile'),
  preorderIntro: 'Assortimento preordine nell’ordine dello shop B2B. Apri un gruppo, metti le quantità nel carrello, poi scegli «Preordine» con la data richiesta.',
  preorderStart: 'Avvia preordine', preorderActive: 'Modalità preordine attiva: il checkout è impostato su preordine.',
  products: n => `${n} prodotti`, show: 'Mostra', specialPrice: 'Prezzo speciale', specialHint: 'escluso da ulteriori sconti',
  newArrival: d => `Nuovo arrivo ${d}`,
};

const TEXTS: Record<string, B2BShopTexts> = { de, en, fr, it };

export function b2bShopTexts(locale?: string | null): B2BShopTexts {
  return TEXTS[uiLang(locale)] ?? en;
}

const DATE_LOCALE: Record<string, string> = { de: 'de-DE', en: 'en-GB', fr: 'fr-FR', it: 'it-IT' };

export function shopDate(iso: string | null | undefined, locale?: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString(DATE_LOCALE[uiLang(locale)] ?? 'de-DE');
}

export function shopMoney(v: number | null | undefined, locale?: string | null): string {
  if (v === null || v === undefined) return '–';
  return new Intl.NumberFormat(DATE_LOCALE[uiLang(locale)] ?? 'de-DE', { style: 'currency', currency: 'EUR' }).format(v);
}
