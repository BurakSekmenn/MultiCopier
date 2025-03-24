const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Dil ayarlarının tutulacağı dosya
const userDataPath = app.getPath('userData');
const langConfigPath = path.join(userDataPath, 'language-config.json');

// Mevcut desteklenen diller
const SUPPORTED_LANGUAGES = ['tr', 'en'];
const DEFAULT_LANGUAGE = 'tr';

// Dil verilerini tutan değişken
let translations = {};
let currentLanguage = DEFAULT_LANGUAGE;

// Dil dosyalarını yükle
function loadTranslations() {
  SUPPORTED_LANGUAGES.forEach(lang => {
    try {
      const translationPath = path.join(__dirname, 'locales', `${lang}.json`);
      if (fs.existsSync(translationPath)) {
        const data = fs.readFileSync(translationPath, 'utf8');
        translations[lang] = JSON.parse(data);
        console.log(`${lang} dili yüklendi`);
      } else {
        console.error(`${lang} dil dosyası bulunamadı`);
      }
    } catch (error) {
      console.error(`${lang} dil dosyası yüklenirken hata oluştu:`, error);
    }
  });
}

// Kullanıcı dil ayarını yükle
function loadLanguageConfig() {
  try {
    if (fs.existsSync(langConfigPath)) {
      const data = fs.readFileSync(langConfigPath, 'utf8');
      const config = JSON.parse(data);
      
      // Geçerli bir dil mi kontrol et
      if (config.language && SUPPORTED_LANGUAGES.includes(config.language)) {
        currentLanguage = config.language;
        console.log(`Dil ayarı yüklendi: ${currentLanguage}`);
      } else {
        console.warn(`Geçersiz dil ayarı, varsayılan dil kullanılıyor: ${DEFAULT_LANGUAGE}`);
        currentLanguage = DEFAULT_LANGUAGE;
      }
    } else {
      // Varsayılan dil ayarını kaydet
      saveLanguageConfig(DEFAULT_LANGUAGE);
      console.log(`Varsayılan dil ayarı kaydedildi: ${DEFAULT_LANGUAGE}`);
    }
  } catch (error) {
    console.error('Dil ayarı yüklenirken hata oluştu:', error);
    currentLanguage = DEFAULT_LANGUAGE;
  }
}

// Dil ayarını kaydet
function saveLanguageConfig(language) {
  try {
    // Klasörün var olduğundan emin ol
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    fs.writeFileSync(langConfigPath, JSON.stringify({ language }, null, 2), 'utf8');
    console.log(`Dil ayarı kaydedildi: ${language}`);
    
    // Global değişkeni güncelle
    currentLanguage = language;
    
    return true;
  } catch (error) {
    console.error('Dil ayarı kaydedilirken hata oluştu:', error);
    return false;
  }
}

// Belirli bir metin için çeviri döndür
function translate(key, variables = {}) {
  try {
    // Anahtar yolu (örn: "menu.file")
    const keyPath = key.split('.');
    
    // Mevcut dil verilerinden ilgili çeviriyi bul
    let translation = translations[currentLanguage];
    
    // Anahtar yolunu takip et
    for (const k of keyPath) {
      if (translation && translation[k]) {
        translation = translation[k];
      } else {
        // Çeviri bulunamadı, ana dilde ara
        let defaultTranslation = translations[DEFAULT_LANGUAGE];
        for (const d of keyPath) {
          if (defaultTranslation && defaultTranslation[d]) {
            defaultTranslation = defaultTranslation[d];
          } else {
            return key; // Ana dilde de bulunamadı
          }
        }
        translation = defaultTranslation;
        break;
      }
    }
    
    // Değişken değiştirme işlemi
    if (typeof translation === 'string' && Object.keys(variables).length > 0) {
      Object.keys(variables).forEach(varName => {
        translation = translation.replace(new RegExp(`{${varName}}`, 'g'), variables[varName]);
      });
    }
    
    return translation || key;
  } catch (error) {
    console.error(`Çeviri hatası (${key}):`, error);
    return key;
  }
}

// Desteklenen dil listesini döndür
function getSupportedLanguages() {
  return SUPPORTED_LANGUAGES.map(lang => {
    return {
      code: lang,
      name: translate(`language.${lang}`)
    };
  });
}

// Mevcut dili döndür
function getCurrentLanguage() {
  return currentLanguage;
}

// Dili değiştir
function changeLanguage(language) {
  if (SUPPORTED_LANGUAGES.includes(language)) {
    return saveLanguageConfig(language);
  }
  return false;
}

// Başlangıç işlemleri
function initialize() {
  loadTranslations();
  loadLanguageConfig();
}

module.exports = {
  initialize,
  translate,
  getCurrentLanguage,
  changeLanguage,
  getSupportedLanguages
}; 