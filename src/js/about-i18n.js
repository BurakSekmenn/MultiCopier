// i18n integration for about.html
const { ipcRenderer } = require('electron');

// UI Elements that need translation
const elements = {
  pageTitle: document.querySelector('title'),
  headerTitle: document.querySelector('h1'),
  appDescription: document.querySelector('.app-description'),
  versionLabel: document.querySelector('.version-label'),
  authorLabel: document.querySelector('.author-label'),
  copyrightText: document.querySelector('.copyright'),
  licenseText: document.querySelector('.license'),
  aboutTitle: document.querySelector('.about-section-title'),
  aboutContent: document.querySelector('.about-section-content'),
  closeButton: document.getElementById('close-btn')
};

// Update the UI with translated text
function updateUI(data) {
  // Update page title
  document.title = data.about.title;
  
  // Update header
  if (elements.headerTitle) elements.headerTitle.textContent = data.about.title;
  if (elements.appDescription) elements.appDescription.textContent = data.app.description;
  
  // Update version info
  if (elements.versionLabel) {
    const versionSpan = elements.versionLabel.querySelector('span:first-child');
    if (versionSpan) versionSpan.textContent = data.about.version + ': ';
  }
  
  // Update author info
  if (elements.authorLabel) {
    const authorSpan = elements.authorLabel.querySelector('span:first-child');
    if (authorSpan) authorSpan.textContent = data.about.author + ': ';
  }
  
  // Update copyright and license
  if (elements.copyrightText) elements.copyrightText.textContent = data.about.copyright;
  if (elements.licenseText) elements.licenseText.textContent = data.about.license;
  
  // Update about section
  if (elements.aboutTitle) elements.aboutTitle.textContent = data.about.aboutTitle;
  if (elements.aboutContent) elements.aboutContent.textContent = data.about.aboutContent;
  
  // Update close button
  if (elements.closeButton) elements.closeButton.textContent = data.about.closeButton;
}

// Request translations from the main process
function requestTranslations() {
  ipcRenderer.send('get-about-translations');
}

// Listen for translations from the main process
ipcRenderer.on('about-translations', (event, data) => {
  updateUI(data);
});

// Listen for language changes
ipcRenderer.on('language-changed', (event, language) => {
  console.log('Language changed to:', language);
  requestTranslations();
});

// Initialize when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
  requestTranslations();
});

// Export functions to be used from other scripts
window.i18n = {
  updateUI,
  requestTranslations
}; 