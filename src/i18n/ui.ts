/**
 * Oberflaechentexte des Finders je Sprache (owner 2026-11-04, media 132948:
 * Produktdialog im Franzoesisch-Modus war deutsch). Die Sprachauswahl bietet
 * jede Sprache mit Produkttexten an (facets.content_languages: de, en, fr, it);
 * die Beschriftungen kommen von hier. Fehlt ein Text, gilt Englisch, dann Deutsch.
 */
export type UiLang = 'de' | 'en' | 'fr' | 'it' | 'es';

const de = {
  color: 'Farbe',
  sizesAndQuantities: 'Größen & Mengen',
  quantityPerSize: 'Menge je Größe',
  available: (n: number) => `${n} verfügbar`,
  notAvailable: 'nicht verfügbar',
  notDeliverable: 'Nicht lieferbar',
  notDeliverableUntil: (d: string) => `Nicht lieferbar · ab ${d}`,
  allSizesDeliverable: 'Alle Größen lieferbar',
  sizesDeliverable: (n: number, of: number) => `${n} von ${of} Größen lieferbar`,
  deliverable: (n: number) => `Lieferbar · ${n}`,
  size: 'Größe',
  sizeChoose: 'bitte wählen',
  sizeChooseFirst: 'bitte zuerst wählen',
  inCart: 'im Warenkorb',
  inCartDone: '✓ Im Warenkorb',
  addToCart: 'Add to Cart',
  addToCartQty: (n: number) => `Add to Cart · ${n} Stk.`,
  moreDetails: 'Mehr Details',
  less: 'Weniger',
  close: 'Schließen',
  noImage: 'Kein Produktbild verfügbar',
  background: 'Hintergrund',
  notify: 'Benachrichtigen',
  notifyHint: 'wenn wieder verfügbar',
  notifyActive: 'Benachrichtigung aktiv',
  notifyActiveHint: 'Klick zum Abbestellen',
  backInStock: 'Wieder verfügbar',
  backInStockHint: 'Bestand ist zurück',
  productDetails: 'Produktdetails',
  technicalData: 'Technische Daten',
  productInfo: 'Produktinformationen',
  articleData: 'Artikeldaten',
  spareParts: 'Ersatzteile',
  goesWellWith: 'Passt dazu',
  weight: 'Gewicht',
  modelYear: 'Modelljahr',
  sizes: 'Größen',
  sport: 'Sportart',
  targetGroup: 'Zielgruppe',
  productLine: 'Produktlinie',
  productType: 'Produkttyp',
  material: 'Material',
  articleNumber: 'Artikelnummer',
  sizeChart: 'Größentabelle',
  reset: 'zurücksetzen',
  inStockShort: 'verfügbar',
  fewLeft: 'nur noch wenige',
};
export type UiTexts = typeof de;

const en: UiTexts = {
  color: 'Colour',
  sizesAndQuantities: 'Sizes & quantities',
  quantityPerSize: 'Quantity per size',
  available: n => `${n} available`,
  notAvailable: 'not available',
  notDeliverable: 'Not available',
  notDeliverableUntil: d => `Not available · from ${d}`,
  allSizesDeliverable: 'All sizes available',
  sizesDeliverable: (n, of) => `${n} of ${of} sizes available`,
  deliverable: n => `Available · ${n}`,
  size: 'Size',
  sizeChoose: 'please choose',
  sizeChooseFirst: 'please choose first',
  inCart: 'in cart',
  inCartDone: '✓ In cart',
  addToCart: 'Add to Cart',
  addToCartQty: n => `Add to Cart · ${n} pcs`,
  moreDetails: 'More details',
  less: 'Less',
  close: 'Close',
  noImage: 'No product image available',
  background: 'Background',
  notify: 'Notify me',
  notifyHint: 'when back in stock',
  notifyActive: 'Notification active',
  notifyActiveHint: 'Click to cancel',
  backInStock: 'Back in stock',
  backInStockHint: 'Stock is back',
  productDetails: 'Product details',
  technicalData: 'Technical data',
  productInfo: 'Product information',
  articleData: 'Article data',
  spareParts: 'Spare parts',
  goesWellWith: 'Goes well with',
  weight: 'Weight',
  modelYear: 'Model year',
  sizes: 'Sizes',
  sport: 'Sport',
  targetGroup: 'Target group',
  productLine: 'Product line',
  productType: 'Product type',
  material: 'Material',
  articleNumber: 'Article number',
  sizeChart: 'Size chart',
  reset: 'reset',
  inStockShort: 'available',
  fewLeft: 'only a few left',
};

const fr: UiTexts = {
  color: 'Couleur',
  sizesAndQuantities: 'Tailles & quantités',
  quantityPerSize: 'Quantité par taille',
  available: n => `${n} disponibles`,
  notAvailable: 'indisponible',
  notDeliverable: 'Indisponible',
  notDeliverableUntil: d => `Indisponible · dès le ${d}`,
  allSizesDeliverable: 'Toutes les tailles disponibles',
  sizesDeliverable: (n, of) => `${n} tailles sur ${of} disponibles`,
  deliverable: n => `Disponible · ${n}`,
  size: 'Taille',
  sizeChoose: 'veuillez choisir',
  sizeChooseFirst: "veuillez d'abord choisir",
  inCart: 'dans le panier',
  inCartDone: '✓ Dans le panier',
  addToCart: 'Ajouter au panier',
  addToCartQty: n => `Ajouter au panier · ${n} pcs`,
  moreDetails: 'Plus de détails',
  less: 'Moins',
  close: 'Fermer',
  noImage: 'Aucune image disponible',
  background: 'Arrière-plan',
  notify: "M'avertir",
  notifyHint: 'dès que disponible',
  notifyActive: 'Alerte activée',
  notifyActiveHint: 'Cliquer pour annuler',
  backInStock: 'De nouveau disponible',
  backInStockHint: 'Le stock est de retour',
  productDetails: 'Détails du produit',
  technicalData: 'Caractéristiques techniques',
  productInfo: 'Informations produit',
  articleData: "Données de l'article",
  spareParts: 'Pièces détachées',
  goesWellWith: 'Va bien avec',
  weight: 'Poids',
  modelYear: 'Année modèle',
  sizes: 'Tailles',
  sport: 'Sport',
  targetGroup: 'Public',
  productLine: 'Gamme',
  productType: 'Type de produit',
  material: 'Matière',
  articleNumber: "Numéro d'article",
  sizeChart: 'Guide des tailles',
  reset: 'réinitialiser',
  inStockShort: 'disponible',
  fewLeft: 'plus que quelques-uns',
};

const it: UiTexts = {
  color: 'Colore',
  sizesAndQuantities: 'Taglie e quantità',
  quantityPerSize: 'Quantità per taglia',
  available: n => `${n} disponibili`,
  notAvailable: 'non disponibile',
  notDeliverable: 'Non disponibile',
  notDeliverableUntil: d => `Non disponibile · dal ${d}`,
  allSizesDeliverable: 'Tutte le taglie disponibili',
  sizesDeliverable: (n, of) => `${n} taglie su ${of} disponibili`,
  deliverable: n => `Disponibile · ${n}`,
  size: 'Taglia',
  sizeChoose: 'scegli',
  sizeChooseFirst: 'scegli prima',
  inCart: 'nel carrello',
  inCartDone: '✓ Nel carrello',
  addToCart: 'Aggiungi al carrello',
  addToCartQty: n => `Aggiungi al carrello · ${n} pz`,
  moreDetails: 'Più dettagli',
  less: 'Meno',
  close: 'Chiudi',
  noImage: 'Nessuna immagine disponibile',
  background: 'Sfondo',
  notify: 'Avvisami',
  notifyHint: 'quando torna disponibile',
  notifyActive: 'Avviso attivo',
  notifyActiveHint: 'Clicca per annullare',
  backInStock: 'Di nuovo disponibile',
  backInStockHint: 'Lo stock è tornato',
  productDetails: 'Dettagli prodotto',
  technicalData: 'Dati tecnici',
  productInfo: 'Informazioni sul prodotto',
  articleData: 'Dati articolo',
  spareParts: 'Ricambi',
  goesWellWith: 'Si abbina con',
  weight: 'Peso',
  modelYear: 'Anno modello',
  sizes: 'Taglie',
  sport: 'Sport',
  targetGroup: 'Destinatari',
  productLine: 'Linea',
  productType: 'Tipo di prodotto',
  material: 'Materiale',
  articleNumber: 'Codice articolo',
  sizeChart: 'Tabella taglie',
  reset: 'azzera',
  inStockShort: 'disponibile',
  fewLeft: 'solo pochi pezzi',
};

const TEXTS: Record<string, UiTexts> = { de, en, fr, it };

export function uiLang(locale?: string | null): string {
  return (locale || 'de').toLowerCase().slice(0, 2);
}

export function uiTexts(locale?: string | null): UiTexts {
  return TEXTS[uiLang(locale)] ?? en;
}

/** Datenwerte aus dem deutschen Stamm (Zielgruppe, Produkttyp) fuer die Anzeige */
const VALUE_MAP: Record<string, Record<string, string>> = {
  Erwachsene: { en: 'Adults', fr: 'Adultes', it: 'Adulti' },
  Jugendliche: { en: 'Youth', fr: 'Enfants', it: 'Ragazzi' },
  Helm: { en: 'Helmet', fr: 'Casque', it: 'Casco' },
  Hose: { en: 'Pants', fr: 'Pantalon', it: 'Pantaloni' },
  Jersey: { en: 'Jersey', fr: 'Maillot', it: 'Maglia' },
  Handschuh: { en: 'Gloves', fr: 'Gants', it: 'Guanti' },
  Schuh: { en: 'Boots', fr: 'Bottes', it: 'Stivali' },
  Stiefel: { en: 'Boots', fr: 'Bottes', it: 'Stivali' },
  Protektor: { en: 'Protector', fr: 'Protection', it: 'Protezione' },
  Brille: { en: 'Goggles', fr: 'Masque', it: 'Maschera' },
  Jacke: { en: 'Jacket', fr: 'Veste', it: 'Giacca' },
  Rucksack: { en: 'Backpack', fr: 'Sac à dos', it: 'Zaino' },
  Tasche: { en: 'Bag', fr: 'Sac', it: 'Borsa' },
};

export function uiValue(value: string, locale?: string | null): string {
  const lang = uiLang(locale);
  if (lang === 'de') return value;
  return value.split(/,\s*/).map(v => VALUE_MAP[v]?.[lang] ?? VALUE_MAP[v]?.en ?? v).join(', ');
}

/** Texte des Hauptteils (Kopfleiste, Suche, Meine Auswahl, Smart Search, Warenkorb) */
const APP_DE = {
  group: 'Gruppieren',
  category: 'Kategorie',
  groupBy: 'Gruppieren nach',
  sort: 'Sortieren',
  sortNone: 'Sortierung',
  name: 'Name', price: 'Preis', weight: 'Gewicht', color: 'Farbe',
  view: 'Ansicht',
  allProducts: 'Alle Produkte',
  noHits: 'Keine Treffer',
  hits: (n: number) => `${n} Treffer`,
  showAllHits: 'Alle Treffer im Finder anzeigen (Enter)',
  searchResult: 'Suchergebnis',
  searchWholeCatalog: 'Suche über den gesamten Katalog — Klick beendet die Suche',
  resetAiFilter: 'KI-Filter zurücksetzen',
  resetFilter: 'Filter zurücksetzen',
  close: 'Schließen',
  menu: 'Menü',
  dealerLogin: 'Händler-Login',
  dealerLoginShop: 'Händler-Login (B2B-Shop)',
  dealerAccount: 'Händlerkonto',
  customer: (n: string) => `Kunde ${n}`,
  orderOverview: 'Bestellübersicht',
  myOrders: 'Meine Bestellungen',
  mySelection: 'Meine Auswahl',
  cartEmpty: 'Warenkorb leer',
  positions: (n: number) => `${n} ${n === 1 ? 'Position' : 'Positionen'}`,
  prevProduct: 'Vorheriges Produkt',
  nextProduct: 'Nächstes Produkt',
  backToOverview: 'Zurück zur Übersicht',
  showAll: 'Alle zeigen',
  favoritesEmpty: 'Noch keine. Tipp in der Produktkarte auf das Herz, dann landet das Produkt hier.',
  removeFavorite: 'Von der Merkliste entfernen',
  remove: 'Entfernen',
  outfits: 'Outfits',
  outfitsEmpty: 'Noch keine Outfits. Lass dir in der Smart Search eine Ausrüstung mit KI zeigen, sie landet automatisch hier.',
  openOutfit: 'Outfit öffnen',
  deleteOutfit: 'Outfit löschen',
  delete: 'Löschen',
  aiOutfit: 'KI-Outfit',
  hitsFor: (n: number, q: string) => `${n} Treffer für »${q}« – anzeigen`,
  cancelSearch: 'Suche abbrechen',
  showGearWithAi: 'Ausrüstung mit KI zeigen',
  aiImageFailed: 'KI-Bild fehlgeschlagen – nochmal versuchen',
  aiImagePending: 'KI-Bild des Outfits wird erzeugt … ca. 1–2 Min.',
  showProducts: 'Produkte anzeigen',
  noMatchingProducts: 'Keine passenden Produkte gefunden.',
  aiSearchFailed: 'Die KI-Suche ist fehlgeschlagen.',
  notInBrand: 'Die gefundenen Produkte sind nicht in dieser Marke.',
};
type AppTexts = typeof APP_DE;
const APP: Record<string, AppTexts> = {
  de: APP_DE,
  en: {
    group: 'Group', category: 'Category', groupBy: 'Group by', sort: 'Sort', sortNone: 'Sort',
    name: 'Name', price: 'Price', weight: 'Weight', color: 'Colour', view: 'View',
    allProducts: 'All products', noHits: 'No results', hits: n => `${n} results`,
    showAllHits: 'Show all results in the finder (Enter)', searchResult: 'Search result',
    searchWholeCatalog: 'Searching the whole catalogue — click to end the search',
    resetAiFilter: 'Reset AI filter', resetFilter: 'Reset filter', close: 'Close', menu: 'Menu',
    dealerLogin: 'Dealer login', dealerLoginShop: 'Dealer login (B2B shop)', dealerAccount: 'Dealer account',
    customer: n => `Customer ${n}`, orderOverview: 'Order overview', myOrders: 'My orders',
    mySelection: 'My selection', cartEmpty: 'Cart empty', positions: n => `${n} ${n === 1 ? 'item' : 'items'}`,
    prevProduct: 'Previous product', nextProduct: 'Next product', backToOverview: 'Back to overview',
    showAll: 'Show all', favoritesEmpty: 'Nothing yet. Tap the heart on a product card and it lands here.',
    removeFavorite: 'Remove from favourites', remove: 'Remove', outfits: 'Outfits',
    outfitsEmpty: 'No outfits yet. Let Smart Search show you an AI outfit and it lands here automatically.',
    openOutfit: 'Open outfit', deleteOutfit: 'Delete outfit', delete: 'Delete', aiOutfit: 'AI outfit',
    hitsFor: (n, q) => `${n} results for »${q}« – show`, cancelSearch: 'Cancel search',
    showGearWithAi: 'Show gear with AI', aiImageFailed: 'AI image failed – try again',
    aiImagePending: 'Creating the AI outfit image … approx. 1–2 min.', showProducts: 'Show products',
    noMatchingProducts: 'No matching products found.', aiSearchFailed: 'The AI search failed.',
    notInBrand: 'The products found are not in this brand.',
  },
  fr: {
    group: 'Regrouper', category: 'Catégorie', groupBy: 'Regrouper par', sort: 'Trier', sortNone: 'Tri',
    name: 'Nom', price: 'Prix', weight: 'Poids', color: 'Couleur', view: 'Affichage',
    allProducts: 'Tous les produits', noHits: 'Aucun résultat', hits: n => `${n} résultats`,
    showAllHits: 'Afficher tous les résultats (Entrée)', searchResult: 'Résultats de recherche',
    searchWholeCatalog: 'Recherche dans tout le catalogue — cliquer pour terminer',
    resetAiFilter: 'Réinitialiser le filtre IA', resetFilter: 'Réinitialiser le filtre', close: 'Fermer', menu: 'Menu',
    dealerLogin: 'Connexion revendeur', dealerLoginShop: 'Connexion revendeur (boutique B2B)', dealerAccount: 'Compte revendeur',
    customer: n => `Client ${n}`, orderOverview: 'Récapitulatif de commande', myOrders: 'Mes commandes',
    mySelection: 'Ma sélection', cartEmpty: 'Panier vide', positions: n => `${n} ${n === 1 ? 'article' : 'articles'}`,
    prevProduct: 'Produit précédent', nextProduct: 'Produit suivant', backToOverview: "Retour à l'aperçu",
    showAll: 'Tout afficher', favoritesEmpty: 'Rien pour le moment. Touchez le cœur sur une fiche produit pour l’ajouter ici.',
    removeFavorite: 'Retirer des favoris', remove: 'Retirer', outfits: 'Tenues',
    outfitsEmpty: 'Aucune tenue. Demandez à la Smart Search une tenue en IA, elle apparaîtra ici automatiquement.',
    openOutfit: 'Ouvrir la tenue', deleteOutfit: 'Supprimer la tenue', delete: 'Supprimer', aiOutfit: 'Tenue IA',
    hitsFor: (n, q) => `${n} résultats pour »${q}« – afficher`, cancelSearch: 'Annuler la recherche',
    showGearWithAi: "Voir l'équipement en IA", aiImageFailed: "Échec de l'image IA – réessayer",
    aiImagePending: "Création de l'image IA … env. 1–2 min.", showProducts: 'Afficher les produits',
    noMatchingProducts: 'Aucun produit correspondant.', aiSearchFailed: 'La recherche IA a échoué.',
    notInBrand: 'Les produits trouvés ne sont pas de cette marque.',
  },
  it: {
    group: 'Raggruppa', category: 'Categoria', groupBy: 'Raggruppa per', sort: 'Ordina', sortNone: 'Ordinamento',
    name: 'Nome', price: 'Prezzo', weight: 'Peso', color: 'Colore', view: 'Vista',
    allProducts: 'Tutti i prodotti', noHits: 'Nessun risultato', hits: n => `${n} risultati`,
    showAllHits: 'Mostra tutti i risultati (Invio)', searchResult: 'Risultati di ricerca',
    searchWholeCatalog: "Ricerca nell'intero catalogo — clic per terminare",
    resetAiFilter: 'Azzera filtro IA', resetFilter: 'Azzera filtro', close: 'Chiudi', menu: 'Menu',
    dealerLogin: 'Accesso rivenditori', dealerLoginShop: 'Accesso rivenditori (shop B2B)', dealerAccount: 'Account rivenditore',
    customer: n => `Cliente ${n}`, orderOverview: 'Riepilogo ordine', myOrders: 'I miei ordini',
    mySelection: 'La mia selezione', cartEmpty: 'Carrello vuoto', positions: n => `${n} ${n === 1 ? 'articolo' : 'articoli'}`,
    prevProduct: 'Prodotto precedente', nextProduct: 'Prodotto successivo', backToOverview: 'Torna alla panoramica',
    showAll: 'Mostra tutti', favoritesEmpty: 'Ancora niente. Tocca il cuore nella scheda prodotto e finisce qui.',
    removeFavorite: 'Rimuovi dai preferiti', remove: 'Rimuovi', outfits: 'Outfit',
    outfitsEmpty: 'Nessun outfit. Fatti mostrare un outfit IA dalla Smart Search, apparirà qui automaticamente.',
    openOutfit: 'Apri outfit', deleteOutfit: 'Elimina outfit', delete: 'Elimina', aiOutfit: 'Outfit IA',
    hitsFor: (n, q) => `${n} risultati per »${q}« – mostra`, cancelSearch: 'Annulla ricerca',
    showGearWithAi: "Mostra l'equipaggiamento con IA", aiImageFailed: 'Immagine IA non riuscita – riprova',
    aiImagePending: "Creazione dell'immagine IA … ca. 1–2 min.", showProducts: 'Mostra prodotti',
    noMatchingProducts: 'Nessun prodotto trovato.', aiSearchFailed: 'La ricerca IA non è riuscita.',
    notInBrand: 'I prodotti trovati non sono di questo marchio.',
  },
};

export function appTexts(locale?: string | null): AppTexts {
  return APP[uiLang(locale)] ?? APP.en;
}

/** Namen der Gruppierungen (deutsche Labels aus Analyzer/LayoutService) */
const DIM_LABELS: Record<string, Record<string, string>> = {
  Produkttyp: { en: 'Product type', fr: 'Type de produit', it: 'Tipo di prodotto' },
  Produktkategorie: { en: 'Product category', fr: 'Catégorie de produit', it: 'Categoria prodotto' },
  Kategorie: { en: 'Category', fr: 'Catégorie', it: 'Categoria' },
  Sport: { en: 'Sport', fr: 'Sport', it: 'Sport' },
  Produktlinie: { en: 'Product line', fr: 'Gamme', it: 'Linea' },
  Zielgruppe: { en: 'Target group', fr: 'Public', it: 'Destinatari' },
  'Körperteil': { en: 'Body part', fr: 'Partie du corps', it: 'Parte del corpo' },
  Funktion: { en: 'Function', fr: 'Fonction', it: 'Funzione' },
  Farbe: { en: 'Colour', fr: 'Couleur', it: 'Colore' },
  Jahrgang: { en: 'Model year', fr: 'Année', it: 'Anno' },
  Preis: { en: 'Price', fr: 'Prix', it: 'Prezzo' },
  Gewicht: { en: 'Weight', fr: 'Poids', it: 'Peso' },
  Marke: { en: 'Brand', fr: 'Marque', it: 'Marchio' },
  Typ: { en: 'Type', fr: 'Type', it: 'Tipo' },
  'Größe': { en: 'Size', fr: 'Taille', it: 'Taglia' },
  'Verfügbarkeit': { en: 'Availability', fr: 'Disponibilité', it: 'Disponibilità' },
  Ersatzteil: { en: 'Spare part', fr: 'Pièce détachée', it: 'Ricambio' },
};

export function uiDimLabel(label: string, locale?: string | null): string {
  const lang = uiLang(locale);
  return lang === 'de' ? label : DIM_LABELS[label]?.[lang] ?? DIM_LABELS[label]?.en ?? label;
}

/**
 * Gruppennamen auf der Flaeche und in der Brotkrumen-Leiste (Kategorien-
 * Taxonomie, Familien, Werte). Nur Anzeige: Drill-Schluessel bleiben deutsch.
 * Grossschreibung des Originals bleibt erhalten (Poster in Versalien).
 */
const GROUP_LABELS: Record<string, Record<string, string>> = {
  'alle produkte': { en: 'All products', fr: 'Tous les produits', it: 'Tutti i prodotti' },
  alle: { en: 'All', fr: 'Tout', it: 'Tutti' },
  helme: { en: 'Helmets', fr: 'Casques', it: 'Caschi' },
  brillen: { en: 'Goggles', fr: 'Masques', it: 'Maschere' },
  kleidung: { en: 'Apparel', fr: 'Vêtements', it: 'Abbigliamento' },
  protektoren: { en: 'Protection', fr: 'Protections', it: 'Protezioni' },
  stiefel: { en: 'Boots', fr: 'Bottes', it: 'Stivali' },
  schuhe: { en: 'Shoes', fr: 'Chaussures', it: 'Scarpe' },
  'schuhe & stiefel': { en: 'Shoes & boots', fr: 'Chaussures & bottes', it: 'Scarpe e stivali' },
  accessories: { en: 'Accessories', fr: 'Accessoires', it: 'Accessori' },
  accessoires: { en: 'Accessories', fr: 'Accessoires', it: 'Accessori' },
  ersatzteile: { en: 'Spare parts', fr: 'Pièces détachées', it: 'Ricambi' },
  frauen: { en: 'Women', fr: 'Femmes', it: 'Donna' },
  'frauen mx': { en: 'Women MX', fr: 'Femmes MX', it: 'Donna MX' },
  'frauen mtb': { en: 'Women MTB', fr: 'Femmes VTT', it: 'Donna MTB' },
  kinder: { en: 'Kids', fr: 'Enfants', it: 'Bambini' },
  'kinder mx': { en: 'Kids MX', fr: 'Enfants MX', it: 'Bambini MX' },
  'kinder mtb': { en: 'Kids MTB', fr: 'Enfants VTT', it: 'Bambini MTB' },
  mtb: { fr: 'VTT' },
  'full face helme': { en: 'Full face helmets', fr: 'Casques intégraux', it: 'Caschi integrali' },
  'open face helme': { en: 'Open face helmets', fr: 'Casques jet', it: 'Caschi jet' },
  handschuhe: { en: 'Gloves', fr: 'Gants', it: 'Guanti' },
  hosen: { en: 'Pants', fr: 'Pantalons', it: 'Pantaloni' },
  jacken: { en: 'Jackets', fr: 'Vestes', it: 'Giacche' },
  jerseys: { fr: 'Maillots', it: 'Maglie' },
  shorts: { it: 'Pantaloncini' },
  socken: { en: 'Socks', fr: 'Chaussettes', it: 'Calze' },
  regenkleidung: { en: 'Rainwear', fr: 'Vêtements de pluie', it: 'Abbigliamento antipioggia' },
  'oberkörper': { en: 'Upper body', fr: 'Haut du corps', it: 'Parte superiore' },
  ellenbogen: { en: 'Elbow', fr: 'Coudes', it: 'Gomiti' },
  knie: { en: 'Knee', fr: 'Genoux', it: 'Ginocchia' },
  'knie & beine': { en: 'Knee & legs', fr: 'Genoux & jambes', it: 'Ginocchia e gambe' },
  nackenschutz: { en: 'Neck protection', fr: 'Protection du cou', it: 'Protezione collo' },
  'zubehör': { en: 'Accessories', fr: 'Accessoires', it: 'Accessori' },
  weitere: { en: 'More', fr: 'Autres', it: 'Altri' },
  sonstige: { en: 'Other', fr: 'Autres', it: 'Altro' },
  'alle größen lieferbar': { en: 'All sizes available', fr: 'Toutes les tailles disponibles', it: 'Tutte le taglie disponibili' },
  'teilweise lieferbar': { en: 'Partly available', fr: 'Partiellement disponible', it: 'Parzialmente disponibile' },
  'nicht lieferbar': { en: 'Not available', fr: 'Indisponible', it: 'Non disponibile' },
  erwachsene: { en: 'Adults', fr: 'Adultes', it: 'Adulti' },
  jugendliche: { en: 'Youth', fr: 'Enfants', it: 'Ragazzi' },
  helm: { en: 'Helmet', fr: 'Casque', it: 'Casco' },
  hose: { en: 'Pants', fr: 'Pantalon', it: 'Pantaloni' },
  handschuh: { en: 'Gloves', fr: 'Gants', it: 'Guanti' },
  protektor: { en: 'Protector', fr: 'Protection', it: 'Protezione' },
  brille: { en: 'Goggles', fr: 'Masque', it: 'Maschera' },
  jacke: { en: 'Jacket', fr: 'Veste', it: 'Giacca' },
  socke: { en: 'Socks', fr: 'Chaussettes', it: 'Calze' },
  kappe: { en: 'Cap', fr: 'Casquette', it: 'Cappellino' },
  tasche: { en: 'Bag', fr: 'Sac', it: 'Borsa' },
  rucksack: { en: 'Backpack', fr: 'Sac à dos', it: 'Zaino' },
  zelt: { en: 'Tent', fr: 'Tente', it: 'Tenda' },
  aufkleber: { en: 'Stickers', fr: 'Autocollants', it: 'Adesivi' },
  regenbekleidung: { en: 'Rainwear', fr: 'Vêtements de pluie', it: 'Abbigliamento antipioggia' },
  freizeit: { en: 'Leisure', fr: 'Loisirs', it: 'Tempo libero' },
  kopf: { en: 'Head', fr: 'Tête', it: 'Testa' },
  augen: { en: 'Eyes', fr: 'Yeux', it: 'Occhi' },
  hand: { en: 'Hand', fr: 'Main', it: 'Mano' },
  füße: { en: 'Feet', fr: 'Pieds', it: 'Piedi' },
  beine: { en: 'Legs', fr: 'Jambes', it: 'Gambe' },
  uni: { en: 'One size', fr: 'Taille unique', it: 'Taglia unica' },
};

export function uiGroupLabel(label: string, locale?: string | null): string {
  const lang = uiLang(locale);
  if (!label) return label;
  // Farbgruppen (Dimension Farbe) in jeder Sprache, auch Deutsch
  if (isColorName(label)) return uiColor(label, locale);
  if (lang === 'de') return label;
  const hit = GROUP_LABELS[label.trim().toLowerCase()];
  const t = hit?.[lang] ?? (lang !== 'en' ? undefined : undefined);
  if (!t) return label;
  const upper = label === label.toUpperCase() && /[A-ZÄÖÜ]/.test(label);
  return upper ? t.toUpperCase() : t;
}

/** Anzeigesprache fuer Teile ohne React-Props (Canvas-Renderer) */
let displayLocale = 'de';
export function setDisplayLocale(locale?: string | null): void { displayLocale = uiLang(locale); }
export function displayGroupLabel(label: string): string { return uiGroupLabel(label, displayLocale); }

/**
 * Farbnamen aus dem Artikelstamm (englisch, teils deutsch) je Sprache
 * (owner 2026-11-04). Mehrfarbige Namen werden je Teil uebersetzt
 * ("black/gray/red" -> "schwarz/grau/rot"); Unbekanntes bleibt stehen.
 * Reihenfolge der Felder: de, en, fr, it.
 */
const COLOR_ROWS: Array<[string[], string, string, string, string]> = [
  [['black', 'schwarz'], 'schwarz', 'black', 'noir', 'nero'],
  [['white', 'weiß', 'weiss'], 'weiß', 'white', 'blanc', 'bianco'],
  [['gray', 'grey', 'grau'], 'grau', 'gray', 'gris', 'grigio'],
  [['red', 'rot'], 'rot', 'red', 'rouge', 'rosso'],
  [['blue', 'blau'], 'blau', 'blue', 'bleu', 'blu'],
  [['green', 'grün'], 'grün', 'green', 'vert', 'verde'],
  [['yellow', 'gelb'], 'gelb', 'yellow', 'jaune', 'giallo'],
  [['orange'], 'orange', 'orange', 'orange', 'arancione'],
  [['pink'], 'pink', 'pink', 'rose', 'rosa'],
  [['purple', 'violett', 'violet'], 'violett', 'purple', 'violet', 'viola'],
  [['brown', 'braun'], 'braun', 'brown', 'marron', 'marrone'],
  [['beige'], 'beige', 'beige', 'beige', 'beige'],
  [['gold'], 'gold', 'gold', 'or', 'oro'],
  [['silver', 'silber'], 'silber', 'silver', 'argent', 'argento'],
  [['copper', 'kupfer'], 'kupfer', 'copper', 'cuivre', 'rame'],
  [['clear', 'klar'], 'klar', 'clear', 'transparent', 'trasparente'],
  [['multi'], 'bunt', 'multi', 'multicolore', 'multicolore'],
  [['neon'], 'neon', 'neon', 'fluo', 'fluo'],
  [['neon yellow', 'neon gelb'], 'neongelb', 'neon yellow', 'jaune fluo', 'giallo fluo'],
  [['neon pink'], 'neonpink', 'neon pink', 'rose fluo', 'rosa fluo'],
  [['neon tiger'], 'neon tiger', 'neon tiger', 'tigre fluo', 'tigre fluo'],
  [['anthracite', 'anthrazit'], 'anthrazit', 'anthracite', 'anthracite', 'antracite'],
  [['charcoal'], 'kohlegrau', 'charcoal', 'charbon', 'antracite scuro'],
  [['navy'], 'marineblau', 'navy', 'bleu marine', 'blu navy'],
  [['teal'], 'petrol', 'teal', 'bleu canard', 'verde acqua'],
  [['mint'], 'mint', 'mint', 'menthe', 'menta'],
  [['olive'], 'oliv', 'olive', 'olive', 'oliva'],
  [['khaki'], 'khaki', 'khaki', 'kaki', 'kaki'],
  [['sand'], 'sand', 'sand', 'sable', 'sabbia'],
  [['cream'], 'creme', 'cream', 'crème', 'crema'],
  [['ecru'], 'ecru', 'ecru', 'écru', 'écru'],
  [['indigo'], 'indigo', 'indigo', 'indigo', 'indaco'],
  [['cardinal'], 'kardinalrot', 'cardinal', 'cardinal', 'rosso cardinale'],
  [['light blue'], 'hellblau', 'light blue', 'bleu clair', 'azzurro'],
  [['light gray'], 'hellgrau', 'light gray', 'gris clair', 'grigio chiaro'],
  [['slate gray'], 'schiefergrau', 'slate gray', 'gris ardoise', 'grigio ardesia'],
  [['stone gray'], 'steingrau', 'stone gray', 'gris pierre', 'grigio pietra'],
  [['military green'], 'militärgrün', 'military green', 'vert militaire', 'verde militare'],
  [['cobalt blue'], 'kobaltblau', 'cobalt blue', 'bleu cobalt', 'blu cobalto'],
  [['radium blue'], 'radiumblau', 'radium blue', 'bleu radium', 'blu radium'],
  [['electric red'], 'leuchtrot', 'electric red', 'rouge électrique', 'rosso elettrico'],
  [['desert red'], 'wüstenrot', 'desert red', 'rouge désert', 'rosso deserto'],
  [['miami white'], 'miami-weiß', 'miami white', 'blanc miami', 'bianco miami'],
  [['black onyx'], 'onyxschwarz', 'black onyx', 'noir onyx', 'nero onice'],
  [['black smoke'], 'rauchschwarz', 'black smoke', 'noir fumé', 'nero fumé'],
  [['dark smoke'], 'dunkel getönt', 'dark smoke', 'fumé foncé', 'fumé scuro'],
  [['iridium gold'], 'iridium gold', 'iridium gold', 'iridium or', 'iridio oro'],
];
const LANG_COL: Record<string, number> = { de: 1, en: 2, fr: 3, it: 4 };
const COLOR_MAP = new Map<string, [string[], string, string, string, string]>();
for (const row of COLOR_ROWS) for (const k of row[0]) COLOR_MAP.set(k, row);

function colorWord(token: string, lang: string): string | null {
  const row = COLOR_MAP.get(token.trim().toLowerCase());
  if (!row) return null;
  return row[(LANG_COL[lang] ?? 2) as 1 | 2 | 3 | 4];
}

/** "black/gray/red" -> "schwarz/grau/rot"; behaelt Gross-/Kleinschreibung und Trenner. */
export function uiColor(name: string, locale?: string | null): string {
  if (!name) return name;
  const lang = uiLang(locale);
  const out = name.split(/(\s*\/\s*)/).map(part => {
    if (/^\s*\/\s*$/.test(part)) return part;
    const t = colorWord(part, lang);
    if (!t) return part;
    if (part === part.toUpperCase() && /[A-Z]/.test(part)) return t.toUpperCase();
    if (part[0] && part[0] === part[0].toUpperCase() && /[A-Z]/.test(part[0])) return t[0].toUpperCase() + t.slice(1);
    return t;
  });
  return out.join('');
}

/** Ist der ganze Text ein (mehrteiliger) Farbname? */
export function isColorName(name: string): boolean {
  const parts = name.split(/\s*\/\s*/).filter(Boolean);
  return parts.length > 0 && parts.every(p => COLOR_MAP.has(p.trim().toLowerCase()));
}
export function displayColor(name: string): string { return uiColor(name, displayLocale); }
