// i18n integration for index.html
const { ipcRenderer } = require('electron');

// UI Elements that need translation - move this inside updateUI function
let elements = {};

// Hard-coded strings in renderer.js that need updates
const strings = {
  noClipboardText: 'Panoda kopyalanmış metin bulunamadı.',
  confirmClearAll: 'Tüm kopyalanmış öğeleri silmek istediğinize emin misiniz?',
  copiedToClipboard: 'Panoya kopyalandı! (Ctrl+V ile yapıştırabilirsiniz)',
  pinned: (text, position) => `"${text}" metni Ctrl+${position} pozisyonuna sabitlendi ve panoya kopyalandı!`,
  pin: 'Sabitle',
  unpin: 'Sabiti Kaldır',
  delete: 'Sil'
};

// Dil değişikliği etkinleştirildi mi?
let isTranslationActive = false;

// Translation data structure
let translations = {};

// Format the date using the correct locale
function formatDateWithLocale(dateString, locale = 'tr-TR') {
  const date = new Date(dateString);
  return date.toLocaleString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// Update the UI with translated text
function updateUI(data) {
  console.log('Updating UI with translations:', data);
  
  // Initialize DOM elements here when we're sure the DOM is ready
  elements = {
    pageTitle: document.querySelector('title'),
    headerTitle: document.querySelector('h1'),
    headerSubtitle: document.querySelector('header > div > span:first-child'),
    statusBadge: document.querySelector('.status-badge'),
    noticeText: document.querySelector('.notice'),
    addButton: document.getElementById('add-btn'),
    clearButton: document.getElementById('clear-btn'),
    emptyStateTitle: document.querySelector('#empty-state p:first-child'),
    emptyStateDesc: document.querySelector('#empty-state p:last-child'),
    
    // Info sections
    shortcutsTitle: document.querySelector('.info-section:nth-child(1) .info-title'),
    shortcutsList: document.querySelectorAll('.shortcut-item'),
    shortcutAppVisibility: document.querySelector('#shortcut-item-1 .shortcut-desc'),
    shortcutAutoAdd: document.querySelector('#shortcut-item-2 .shortcut-desc'),
    shortcutAutoPaste: document.querySelector('#shortcut-item-3 .shortcut-desc'),
    shortcutPinText: document.querySelector('#shortcut-item-4 .shortcut-desc'),
    shortcutWith: document.querySelectorAll('.shortcut-with'),
    
    pinningSectionTitle: document.querySelector('.info-section:nth-child(2) .info-title'),
    pinningDesc1: document.getElementById('pinning-desc-1'),
    pinningMethodsTitle: document.getElementById('pinning-methods-title').querySelector('strong'),
    pinningMethod1: document.getElementById('pinning-method-1'),
    pinningMethod2: document.getElementById('pinning-method-2'),
    pinningDesc2: document.getElementById('pinning-desc-2'),
    
    autopasteSectionTitle: document.querySelector('.info-section:nth-child(3) .info-title'),
    autopasteDesc1: document.getElementById('autopaste-desc-1'),
    autopasteDesc2: document.getElementById('autopaste-desc-2'),
    
    dataSectionTitle: document.querySelector('.info-section:nth-child(4) .info-title'),
    dataDesc1: document.getElementById('data-desc-1'),
    dataDesc2: document.getElementById('data-desc-2')
  };
  
  // Store translations globally
  translations = data;
  
  // Mark as active
  isTranslationActive = true;
  
  // Set HTML lang attribute
  document.documentElement.setAttribute('lang', data.currentLanguage || 'tr');
  
  // Update page title
  if (elements.pageTitle) elements.pageTitle.textContent = data.app.title;
  
  // Update header
  if (elements.headerTitle) elements.headerTitle.textContent = data.app.title;
  if (elements.headerSubtitle) elements.headerSubtitle.textContent = data.app.description;
  if (elements.statusBadge) elements.statusBadge.textContent = data.ui.statusBadge;
  
  // Update notice
  if (elements.noticeText) elements.noticeText.textContent = data.ui.notice;
  
  // Update buttons
  if (elements.addButton) elements.addButton.textContent = data.ui.addCurrentSelection;
  if (elements.clearButton) elements.clearButton.textContent = data.main.clearAll;
  
  // Update empty state
  if (elements.emptyStateTitle) elements.emptyStateTitle.textContent = data.ui.emptyStateTitle;
  if (elements.emptyStateDesc) elements.emptyStateDesc.textContent = data.ui.emptyStateDesc;
  
  // Update info sections - Shortcuts
  if (elements.shortcutsTitle) elements.shortcutsTitle.textContent = data.ui.shortcutsTitle;
  if (elements.shortcutAppVisibility) elements.shortcutAppVisibility.textContent = data.ui.shortcutAppVisibility;
  if (elements.shortcutAutoAdd) elements.shortcutAutoAdd.textContent = data.ui.shortcutAutoAdd;
  if (elements.shortcutAutoPaste) elements.shortcutAutoPaste.textContent = data.ui.shortcutAutoPaste;
  if (elements.shortcutPinText) elements.shortcutPinText.textContent = data.ui.shortcutPinText;
  
  // Update shortcut 'with' text
  if (elements.shortcutWith) {
    elements.shortcutWith.forEach(el => {
      el.textContent = data.ui.shortcutWith;
    });
  }
  
  // Update info sections - Pinning feature
  if (elements.pinningSectionTitle) elements.pinningSectionTitle.textContent = data.ui.pinningSectionTitle;
  if (elements.pinningDesc1) elements.pinningDesc1.textContent = data.ui.pinningDesc1;
  if (elements.pinningMethodsTitle) elements.pinningMethodsTitle.textContent = data.ui.pinningMethodsTitle;
  if (elements.pinningMethod1) elements.pinningMethod1.textContent = data.ui.pinningMethod1;
  
  // HTML için özel işleme 
  if (elements.pinningMethod2) {
    const strongText = data.ui.pinningMethod2.replace(/Ctrl\+Shift\+\[1-9\]/g, '<strong>Ctrl+Shift+[1-9]</strong>');
    elements.pinningMethod2.innerHTML = strongText;
  }
  
  // Sarı renkli vurgu için özel işleme
  if (elements.pinningDesc2) {
    let coloredText = data.ui.pinningDesc2;
    
    // Dil hangisi olursa olsun, renk vurgusu ekle
    if (data.currentLanguage === 'en') {
      coloredText = coloredText.replace(/yellow color/g, '<span style="color: var(--pin-color)">yellow color</span>');
    } else {
      coloredText = coloredText.replace(/sarı renkle/g, '<span style="color: var(--pin-color)">sarı renkle</span>');
    }
    
    elements.pinningDesc2.innerHTML = coloredText;
  }
  
  // Update info sections - Auto paste feature
  if (elements.autopasteSectionTitle) elements.autopasteSectionTitle.textContent = data.ui.autopasteSectionTitle;
  if (elements.autopasteDesc1) elements.autopasteDesc1.textContent = data.ui.autopasteDesc1;
  if (elements.autopasteDesc2) elements.autopasteDesc2.textContent = data.ui.autopasteDesc2;
  
  // Update info sections - Data storage
  if (elements.dataSectionTitle) elements.dataSectionTitle.textContent = data.ui.dataSectionTitle;
  if (elements.dataDesc1) elements.dataDesc1.textContent = data.ui.dataDesc1;
  
  // Kod etiketi için özel işleme
  if (elements.dataDesc2) {
    let formattedText = data.ui.dataDesc2;
    if (formattedText.includes('%APPDATA%\\multicopier\\')) {
      formattedText = formattedText.replace('%APPDATA%\\multicopier\\', '<code>%APPDATA%\\multicopier\\</code>');
    }
    elements.dataDesc2.innerHTML = formattedText;
  }
  
  // Override renderer.js string constants
  strings.noClipboardText = data.ui.noClipboardText;
  strings.confirmClearAll = data.ui.confirmClearAll;
  strings.copiedToClipboard = data.ui.copiedToClipboard;
  strings.pin = data.main.pin;
  strings.unpin = data.main.unpin;
  strings.delete = data.main.delete;
  
  // Update any existing clipboard items with the new translations
  updateClipboardItems();
  
  console.log('UI updated with translations');
}

// Update the clipboard items with the new translations
function updateClipboardItems() {
  const pinButtons = document.querySelectorAll('.pin-btn');
  pinButtons.forEach(btn => {
    btn.textContent = strings.pin;
  });
  
  const unpinButtons = document.querySelectorAll('.unpin-btn');
  unpinButtons.forEach(btn => {
    btn.textContent = strings.unpin;
  });
  
  const deleteButtons = document.querySelectorAll('.delete-btn');
  deleteButtons.forEach(btn => {
    btn.textContent = strings.delete;
  });
}

// Request translations from the main process
function requestTranslations() {
  console.log('Requesting translations from main process...');
  ipcRenderer.send('get-index-translations');
}

// Listen for translations from the main process
ipcRenderer.on('index-translations', (event, data) => {
  console.log('Received translations from main process', data);
  updateUI(data);
});

// Listen for language changes
ipcRenderer.on('language-changed', (event, language) => {
  console.log('Language changed to:', language);
  console.log('Updating UI with new language');
  
  // Clear any existing timeouts to prevent race conditions
  if (window.translationTimeoutId) {
    clearTimeout(window.translationTimeoutId);
  }
  
  // Request new translations with a small delay
  window.translationTimeoutId = setTimeout(() => {
    requestTranslations();
    
    // Re-patch renderer functions after language change
    setTimeout(patchRendererFunctions, 300);
  }, 100);
});

// Orijinal fonksiyonları yedekle
let originalAddClipboardItem, originalRemoveClipboardItem, originalClearClipboardItems, originalConfirm;

// Override the renderer.js functions we need to modify
// This should be called after the original functions are defined
function patchRendererFunctions() {
  // Store the original functions
  const originalCreateClipboardItemElement = window.createClipboardItemElement;
  
  // Orijinal alert/confirm fonksiyonlarını yedekle
  originalAddClipboardItem = window.addClipboardItem;
  originalRemoveClipboardItem = window.removeClipboardItem;
  originalClearClipboardItems = window.clearClipboardItems;
  originalConfirm = window.confirm;
  
  // Override browser built-in functions
  if (isTranslationActive) {
    // addClipboardItem'i geçersiz kıl
    window.addClipboardItem = function() {
      const text = clipboard.readText();
      if (!text) {
        alert(strings.noClipboardText);
        return;
      }
      ipcRenderer.send('add-clipboard-item', text);
    };
    
    // clearClipboardItems'i geçersiz kıl
    window.clearClipboardItems = function() {
      if (confirm(strings.confirmClearAll)) {
        ipcRenderer.send('clear-clipboard-items');
      }
    };
  }
  
  if (originalCreateClipboardItemElement) {
    // Override createClipboardItemElement
    window.createClipboardItemElement = (item, index) => {
      const element = originalCreateClipboardItemElement(item, index);
      
      // Update button text with current translations
      const pinBtn = element.querySelector('.pin-btn');
      if (pinBtn) pinBtn.textContent = strings.pin;
      
      const unpinBtn = element.querySelector('.unpin-btn');
      if (unpinBtn) unpinBtn.textContent = strings.unpin;
      
      const deleteBtn = element.querySelector('.delete-btn');
      if (deleteBtn) deleteBtn.textContent = strings.delete;
      
      return element;
    };
  }
}

// Initialize when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded, requesting translations...');
  
  // Slight delay to ensure all resources are loaded
  setTimeout(() => {
    console.log('Requesting translations after DOM is ready');
    requestTranslations();
    
    // Call patchRendererFunctions after translations are initialized
    setTimeout(patchRendererFunctions, 300);
  }, 100);
});

// Export functions to be used from other scripts
window.i18n = {
  updateUI,
  requestTranslations,
  strings
}; 