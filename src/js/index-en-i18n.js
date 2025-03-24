// i18n integration for index-en.html
const { ipcRenderer } = require('electron');

// UI Elements will be queried when updateUI is called
let elements = {};

// Hard-coded strings in renderer.js that need updates - already in English
const strings = {
  noClipboardText: 'No text found in clipboard.',
  confirmClearAll: 'Are you sure you want to delete all copied items?',
  copiedToClipboard: 'Copied to clipboard! (You can paste with Ctrl+V)',
  pinned: (text, position) => `"${text}" text was pinned to Ctrl+${position} position and copied to clipboard!`,
  pin: 'Pin',
  unpin: 'Unpin',
  delete: 'Delete'
};

// Format the date using the correct locale
function formatDateWithLocale(dateString, locale = 'en-US') {
  const date = new Date(dateString);
  return date.toLocaleString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// Update the UI with static English text
function initializeUI() {
  console.log('Initializing UI with English text');
  
  // Initialize DOM elements here
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
  
  // Set HTML lang attribute
  document.documentElement.setAttribute('lang', 'en');
  
  // Update clipboard items with translations
  updateClipboardItems();
  
  console.log('English UI initialized');
}

// Update the clipboard items with English translations
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

// Override the renderer.js functions we need to modify
function patchRendererFunctions() {
  console.log('Patching renderer functions with English strings');
  
  // Store the original functions
  const originalCreateClipboardItemElement = window.createClipboardItemElement;
  
  // Store original functions
  const originalAddClipboardItem = window.addClipboardItem;
  const originalRemoveClipboardItem = window.removeClipboardItem;
  const originalClearClipboardItems = window.clearClipboardItems;
  const originalConfirm = window.confirm;
  
  // Override browser built-in functions
  // addClipboardItem override
  window.addClipboardItem = function() {
    const text = clipboard.readText();
    if (!text) {
      alert(strings.noClipboardText);
      return;
    }
    ipcRenderer.send('add-clipboard-item', text);
  };
  
  // clearClipboardItems override
  window.clearClipboardItems = function() {
    if (confirm(strings.confirmClearAll)) {
      ipcRenderer.send('clear-clipboard-items');
    }
  };
  
  if (originalCreateClipboardItemElement) {
    // Override createClipboardItemElement
    window.createClipboardItemElement = (item, index) => {
      const element = originalCreateClipboardItemElement(item, index);
      
      // Update button text with English translations
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
  console.log('DOM fully loaded, initializing English UI');
  
  // Slight delay to ensure all resources are loaded
  setTimeout(() => {
    initializeUI();
    
    // Call patchRendererFunctions after UI is initialized
    setTimeout(patchRendererFunctions, 300);
  }, 100);
});

// Export functions to be used from other scripts
window.i18n = {
  updateUI: initializeUI,
  strings
}; 