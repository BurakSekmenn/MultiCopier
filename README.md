# MultiCopier

Modern çoklu kopyalama masaüstü uygulaması. Birden fazla metni hafızada tutup, kısayol tuşları ile hızlıca erişmenizi sağlar. Metinleri belirli konumlara sabitleyebilir ve istediğiniz zaman tek bir kısayol tuşu ile kullanabilirsiniz.

## Özellikler

- **Otomatik Kopyalama**: Ctrl+C ile kopyaladığınız her şey otomatik olarak listeye eklenir
- **Çoklu Pano**: Birden çok metni aynı anda belleğe kaydedebilirsiniz
- **Hızlı Erişim**: Ctrl+1, Ctrl+2, ... kısayolları ile kayıtlı metinlere anında erişim
- **Metinleri Sabitleme**: Ctrl+Shift+1, Ctrl+Shift+2, ... kısayolları ile metinleri belirli konumlara sabitleyebilirsiniz
- **Kolay Kullanım**: Ctrl+Q kısayolu ile uygulamayı açma/kapatma
- **Modern Arayüz**: Kullanımı kolay, şık tasarım
- **Sürükle-Bırak**: Kopyalanmış öğeleri sürükle-bırak ile istediğiniz sıraya dizebilirsiniz
- **Arkaplanda Çalışma**: Kapatıldığında sistem tepsisinde çalışmaya devam ederek her zaman hazır olur
- **Dil Desteği**: İngilizce ve Türkçe dil seçenekleri

## Nasıl Kullanılır

### Temel Kullanım

1. Herhangi bir metni seçin ve **Ctrl+C** ile kopyalayın - metin otomatik olarak MultiCopier'a eklenir
2. Listedeki herhangi bir metni kullanmak için **Ctrl+1** ile **Ctrl+9** arasındaki kısayolları kullanın
3. Kısayola basıldığında, metin otomatik olarak panoya kopyalanır ve aktif uygulamaya yapıştırılır

### Metinleri Sabitleme

Sık kullandığınız metinleri belirli pozisyonlara sabitleyebilirsiniz:

1. Herhangi bir metni seçin
2. **Ctrl+Shift+[1-9]** kısayolunu kullanarak metni belirli bir pozisyona sabitleyin
   - Örneğin, Ctrl+Shift+3 tuşları seçili metni 3 numaralı pozisyona sabitler
3. Sabitlenmiş metinler sarı renkle ve 📌 simgesiyle işaretlenir
4. Sabitlenmiş metinlere her zaman aynı kısayolla erişebilirsiniz, yeni metinler eklense bile konumları değişmez

## Kurulum

### Gereksinimler

- Node.js 14 veya üzeri
- Electron (npm üzerinden yükleniyor)

### Geliştirme

```bash
# Bağımlılıkları yükle
npm install

# Uygulamayı başlat
npm start
```

### Dağıtım

```bash
# Windows için paket oluştur
npm run build
```

## Kısayollar

- **Ctrl+Q**: Uygulamayı aç/kapat
- **Ctrl+C**: Metni kopyalayıp otomatik olarak listeye ekler
- **Ctrl+[1-9]**: Listedeki metinleri seçip yapıştırır (1-9 arası pozisyonlar)
- **Ctrl+Shift+[1-9]**: Seçili metni belirtilen pozisyona sabitler (1-9 arası pozisyonlar)


## Teknik Detaylar

- Electron tabanlı masaüstü uygulaması
- Node.js ile geliştirilmiştir
- Verilerin yerel depolanması için JSON dosyaları kullanılır
- Windows için özelleştirilmiş kısayol tuşu mekanizması

## Ekran Görüntüleri

Aşağıda uygulamanın bazı ekran görüntüleri bulunmaktadır:

### Ana Ekran
![Ana Ekran](https://raw.githubusercontent.com/BurakSekmenn/MultiCopier/refs/heads/main/src/screenshot/screenshotanasayfa.png)

### Dil Menüsü
![Dil](https://raw.githubusercontent.com/BurakSekmenn/MultiCopier/refs/heads/main/src/screenshot/screenshotdil.png)


### Kısa Yol Menüsü
![Kısa Yol](https://raw.githubusercontent.com/BurakSekmenn/MultiCopier/refs/heads/main/src/screenshot/screenshotkisayol.png)


## Lisans

MIT 