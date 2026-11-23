import { ComponentType } from '../types/circuit';

export interface ComponentGuideEntry {
  title: string;
  shortDesc: string;
  analogy: string;
  pins: string;
  practicalTip: string;
  typicalValues: string;
}

export const COMPONENT_GUIDE: Record<ComponentType, ComponentGuideEntry> = {
  resistor: {
    title: 'Direnç (Resistor)',
    shortDesc:
      'Devreden geçen elektrik akımını sınırlar ve üzerinde gerilim düşümü oluşturur.',
    analogy:
      'Bir su borusundaki daralma gibidir; boru ne kadar darsa (direnç ne kadar büyükse) suyun akışı o kadar yavaşlar.',
    pins: '2 uçlu (1 ve 2), yön fark etmez (polaritesizdir).',
    practicalTip:
      'Breadboard üzerinde LED veya transistör bağlarken mutlaka akım sınırlayıcı direnç kullan; standart 1/4W dirençlerin aşırı ısınmaması için gücü (P = I²·R) 0.25 W altında tut.',
    typicalValues: '220 Ω, 330 Ω, 1 kΩ, 4.7 kΩ, 10 kΩ, 100 kΩ',
  },

  potentiometer: {
    title: 'Potansiyometre (Potentiometer)',
    shortDesc:
      'Orta ucu hareket ettirilerek direnç oranı ve çıkış gerilimi ayarlanabilen değişken dirençtir.',
    analogy:
      'Bir musluk vanası veya müzik setindeki ses açma düğmesi gibidir; çevirdikçe çıkışa geçen seviyeyi pürüzsüzce değiştirir.',
    pins: '3 uçlu: İki sabit uç (1 ve 2) ve hareketli orta uç (W - Wiper).',
    practicalTip:
      'Gerilim bölücü olarak kullanırken sabit uçları besleme ile toprağa bağla, çıkışı orta uçtan (W) al; yüksek akım çeken yükleri doğrudan orta uçtan besleme.',
    typicalValues: '1 kΩ, 10 kΩ, 50 kΩ, 100 kΩ (doğrusal / logaritmik)',
  },

  capacitor: {
    title: 'Kapasitör / Kondansatör (Capacitor)',
    shortDesc:
      'Elektrik enerjisini elektrik alanında depolar, gerilim değişimlerine karşı koyar ve AC sinyalleri geçirirken DC akımı engeller.',
    analogy:
      'Borudaki basıncı dengeleyen küçük bir su deposu gibidir; su kesilince kısa süre akışı sürdürür, ani dalgalanmaları yumuşatır.',
    pins: '2 uçlu (+ ve -). Seramik kapasitörlerde yön fark etmez; elektrolitik kapasitörlerde uzun bacak (+), şeritli taraf (-) uctur.',
    practicalTip:
      'Elektrolitik kapasitörleri ters bağlama ve çalışma gerilimini aşma; aksi halde şişebilir veya patlayabilir. Besleme hatlarına 100 nF dekuplaj kapasitörü koymak gürültüyü azaltır.',
    typicalValues: '100 pF, 10 nF, 100 nF (0.1 µF), 10 µF, 100 µF, 1000 µF',
  },

  inductor: {
    title: 'İndüktör / Bobin (Inductor)',
    shortDesc:
      'Elektrik enerjisini manyetik alanda depolar ve üzerinden geçen akımın ani değişimine direnç gösterir.',
    analogy:
      'Ağır bir su çarkı (volan) gibidir; döndürmeye başlamak zaman alır ama bir kez dönünce durdurmak da zordur.',
    pins: '2 uçlu (1 ve 2), yön fark etmez (polaritesizdir).',
    practicalTip:
      'Bobinden geçen akımı aniden kesersen çok yüksek ters gerilim (indüktif sıçrama) oluşur; röle veya bobin sürerken mutlaka koruma (flyback) diyotu bağla.',
    typicalValues: '10 µH, 100 µH, 1 mH, 10 mH, 100 mH',
  },

  transformer: {
    title: 'Transformatör / Trafo (Transformer)',
    shortDesc:
      'Manyetik alan aracılığıyla AC gerilimi yükseltir veya düşürür ve giriş ile çıkış devrelerini elektriksel olarak yalıtır.',
    analogy:
      'Bir bisikletin vites dişlileri gibidir; hızı (gerilimi) düşürürken torku (akımı) artırabilir veya tam tersini yapabilir.',
    pins: '4 uçlu: Primer (giriş) sargısı P+ / P- ve Sekonder (çıkış) sargısı S+ / S-.',
    practicalTip:
      'Trafoyu sadece AC (alternatif akım) sinyallerle kullan; DC gerilim uygularsan sargı kısa devre gibi davranıp aşırı ısınır. Simülasyonda sekonder tarafın da toprağa referansı olmalıdır.',
    typicalValues: '230V→12V (n ≈ 0.052), 10:1 (n = 0.1), 1:1 izolasyon trafosu',
  },

  fuse: {
    title: 'Sigorta (Fuse)',
    shortDesc:
      'Devreden güvenli sınırın üzerinde akım geçtiğinde devreyi koruyan güvenlik elemanıdır.',
    analogy:
      'Bir köprüdeki ağırlık kontrol bariyeri gibidir; izin verilenden ağır yük geçmeye çalışırsa diğer parçalar zarar görmeden geçişi keser.',
    pins: '2 uçlu (1 ve 2), yön fark etmez; korunacak devrenin girişine seri bağlanır.',
    practicalTip:
      'Sigortayı her zaman güç kaynağının hemen çıkışına, devrenin geri kalanına seri olarak bağla ve nominal çalışma akımının yaklaşık %25-50 üzerinde değer seç.',
    typicalValues: '250 mA, 500 mA, 1 A, 2 A, 5 A, 10 A',
  },

  lamp: {
    title: 'Lamba / Ampul (Lamp)',
    shortDesc:
      'Üzerinden akım geçtiğinde elektrik enerjisini ışık ve ısıya dönüştüren dirençli yüktür.',
    analogy:
      'Akımın varlığını ve şiddetini anında gösteren görsel bir akış göstergesi gibidir; akım arttıkça daha parlak yanar.',
    pins: '2 uçlu (1 ve 2), yön fark etmez (polaritesizdir).',
    practicalTip:
      'Akkor lambaların soğukken direnci düşüktür ve ilk anda yüksek kalkış akımı çeker; güç kaynağının bu akımı verebildiğinden emin ol.',
    typicalValues: '5 V / 0.5 W, 12 V / 1.5 W, 12 V / 5 W (25 Ω – 150 Ω)',
  },

  vdc: {
    title: 'DC Gerilim Kaynağı (VDC)',
    shortDesc:
      'Zamanla yönü ve değeri değişmeyen sabit doğru gerilim sağlar (pil veya güç kaynağı gibi).',
    analogy:
      'Suyu her zaman aynı yükseklikten ve aynı yönde sabit basınçla iten bir pompa gibidir.',
    pins: '2 uçlu: Üst uç (+ pozitif), alt uç (- negatif / referans).',
    practicalTip:
      'Breadboard üzerinde artı (+) ve eksi (-) hatları asla doğrudan kısa devre etme; renk kodlarını koru (kırmızı = +V, siyah/mavi = GND).',
    typicalValues: '3.3 V, 5 V, 9 V, 12 V, 24 V',
  },

  vac: {
    title: 'AC Gerilim Kaynağı (VAC)',
    shortDesc:
      'Belirli bir frekansta sinüs dalgası şeklinde periyodik olarak yön ve genlik değiştiren gerilim kaynağıdır.',
    analogy:
      'Suyu bir ileri bir geri düzenli ritimle itip çeken pistonlu bir pompa gibidir.',
    pins: '2 uçlu: Faz/Sinyal ucu (+) ve Referans ucu (-).',
    practicalTip:
      'Frekans yanıtı (Bode grafiği) analizi yaparken AC genliğini (acMag) 1 V ayarlamak, çıkış gerilimini doğrudan kazanç (dB) olarak okumanı sağlar.',
    typicalValues: '1 Vpk–10 Vpk @ 50/60 Hz (şebeke) veya 1 kHz (ses/test)',
  },

  vpulse: {
    title: 'Darbe / Kare Dalga Kaynağı (VPULSE)',
    shortDesc:
      'Düşük (VLow) ve yüksek (VHigh) seviyeler arasında hızla geçiş yapan dijital veya kare dalga sinyali üretir.',
    analogy:
      'Bir anahtarı saniyede yüzlerce kez düzenli aralıklarla açıp kapatan otomatik bir mekanizma gibidir.',
    pins: '2 uçlu: Sinyal çıkışı (+) ve Referans ucu (-).',
    practicalTip:
      'RC devrelerinin şarj/deşarj süresini ve lojik kapıların anahtarlama hızını test etmek için idealdir; yükselme süresini (riseTime) sıfır yerine 1 µs gibi küçük bir değer ver.',
    typicalValues: '0–5 V veya 0–3.3 V, 500 Hz – 100 kHz, %50 görev döngüsü',
  },

  idc: {
    title: 'DC Akım Kaynağı (IDC)',
    shortDesc:
      'Bağlı olduğu yükün direncinden bağımsız olarak devreden her zaman sabit miktarda doğru akım geçirir.',
    analogy:
      'Boru daralsa da genişlese de dakikada tam olarak sabit litre su basan pozitif deplasmanlı bir pompa gibidir.',
    pins: '2 uçlu: Akım çıkış/giriş yönünü belirleyen (+) ve (-) uçlar.',
    practicalTip:
      'Bir akım kaynağının uçlarını asla açık devre (boşta) bırakma; akım akacak yol bulamazsa teorik olarak sonsuz gerilim oluşur.',
    typicalValues: '100 µA, 1 mA, 10 mA, 20 mA (LED sürücüler)',
  },

  iac: {
    title: 'AC Akım Kaynağı (IAC)',
    shortDesc:
      'Sinüzoidal olarak yönü ve şiddeti değişen sabit genlikli alternatif akım üretir.',
    analogy:
      'Borudaki basınca aldırmadan sabit miktarda suyu ritmik olarak ileri geri hareket ettiren pompa gibidir.',
    pins: '2 uçlu: (+) ve (-) uçlar (ok yönü pozitif akım yönünü gösterir).',
    practicalTip:
      'Paralel RLC rezonans devrelerini ve transistör küçük sinyal akım kazançlarını test etmek için çok kullanışlıdır.',
    typicalValues: '1 mApk, 10 mApk @ 1 kHz',
  },

  vcvs: {
    title: 'Gerilim Kontrollü Gerilim Kaynağı (VCVS)',
    shortDesc:
      'Kontrol uçlarındaki gerilimi belirli bir kazanç (E) katsayısıyla çarpıp çıkış uçlarına yansıtan ideal bağımlı kaynaktır.',
    analogy:
      'Küçük bir kumanda kolunun hareketini çok daha güçlü bir hidrolik kola birebir aktaran servo sistem gibidir.',
    pins: '4 uçlu: Kontrol girişi (C+ ve C-) ve Çıkış (O+ ve O-).',
    practicalTip:
      'İdeal yükselteç, tampon (buffer) veya izole gerilim sensörü modellerini kurarken hızlıca prototip oluşturmak için kullanılır.',
    typicalValues: 'Kazanç (gain) = 1 (tampon), 2, 10, 100 V/V',
  },

  vccs: {
    title: 'Gerilim Kontrollü Akım Kaynağı (VCCS)',
    shortDesc:
      'Girişindeki kontrol gerilimine orantılı (I = gm · V_ctrl) çıkış akımı üreten transkondüktans kaynağıdır.',
    analogy:
      'Bir musluk kolunun açılma açısına göre sabit oranda su debisi (akım) üreten akıllı vana gibidir.',
    pins: '4 uçlu: Kontrol girişi (C+ ve C-) ve Akım çıkışı (O+ ve O-).',
    practicalTip:
      'Transistörlerin küçük sinyal modellerini (gm·vbe) ve akım çıkışlı sensör devrelerini anlamak için temel yapı taşıdır.',
    typicalValues: 'gm = 1 mS (0.001 A/V), 10 mS, 50 mS',
  },

  diode: {
    title: 'Silikon Diyot (Diode)',
    shortDesc:
      'Elektrik akımını yalnızca tek yönde (anottan katoda) geçiren yarı iletken elemandır; iletimde yaklaşık 0.65–0.7 V gerilim düşer.',
    analogy:
      'Su tesisatındaki tek yönlü çek valf gibidir; su ileri yönde rahatça akar ama geri dönmeye çalışınca kapak kapanır.',
    pins: '2 uçlu: Anot (A, giriş) ve Katot (K, gövdede gümüş/beyaz çizgi olan taraf).',
    practicalTip:
      'Katot tarafındaki çizgiye dikkat et; ters bağlarsan akım geçmez. Doğrultucu ve ters pil koruması devrelerinin vazgeçilmezidir.',
    typicalValues: '1N4148 (küçük sinyal), 1N4007 (1 A / 1000 V doğrultucu)',
  },

  zener: {
    title: 'Zener Diyot (Zener Diode)',
    shortDesc:
      'Ters yönde belirli bir kırılma gerilimine (Vz) ulaşıldığında gerilimi sabit tutarak regülasyon yapan özel diyottur.',
    analogy:
      'Barajdaki taşma kapağı gibidir; su seviyesi belirlenen yüksekliği aşar aşmaz fazla suyu tahliye ederek seviyeyi sabit tutar.',
    pins: '2 uçlu: Anot (A) ve Katot (K, çizgili taraf). Regülatör olarak ters bağlanır (katot artı tarafa).',
    practicalTip:
      'Zener diyotu asla doğrudan güç kaynağına bağlama; her zaman önüne akımı sınırlayan bir seri direnç koy, yoksa aşırı akımdan yanar.',
    typicalValues: '3.3 V, 5.1 V, 6.2 V, 9.1 V, 12 V (1N4733A vb.)',
  },

  schottky: {
    title: 'Schottky Diyot (Schottky Diode)',
    shortDesc:
      'Standart silikon diyotlara göre çok daha düşük ileri gerilim düşümüne (~0.2–0.35 V) ve çok hızlı anahtarlama özelliğine sahip diyottur.',
    analogy:
      'Çok hafif yaylı, neredeyse hiç basınç kaybı yaratmadan hızla açılıp kapanan spor tipi çek valf gibidir.',
    pins: '2 uçlu: Anot (A) ve Katot (K, çizgili taraf).',
    practicalTip:
      'Pil ile çalışan devrelerde ters bağlantı koruması veya DC-DC dönüştürücülerde yüksek verimlilik için standart diyot yerine Schottky seç.',
    typicalValues: '1N5819 (1 A / 40 V), BAT54 (küçük sinyal), SS14',
  },

  led: {
    title: 'LED — Işık Yayan Diyot (LED)',
    shortDesc:
      'Üzerinden doğru yönde akım geçtiğinde ışık yayan yarı iletken diyottur; rengine göre 1.8 V ile 3.2 V arasında gerilim düşürür.',
    analogy:
      'İçinden su aktıkça parlayan tek yönlü şeffaf bir boru vanası gibidir.',
    pins: '2 uçlu: Anot (A, uzun bacak, +) ve Katot (K, kısa bacak / düz kenar, -).',
    practicalTip:
      'LED’i asla seri direnç olmadan doğrudan pile bağlama! Çoğu 5 mm LED için 10–20 mA akım idealdir; R = (V_kaynak - V_LED) / I formülüyle direncini hesapla.',
    typicalValues: 'Kırmızı ~1.85 V, Yeşil ~2.2 V, Mavi/Beyaz ~3.0 V @ 10–20 mA',
  },

  bjt_npn: {
    title: 'NPN Transistör (BJT NPN)',
    shortDesc:
      'Beyz (B) ucuna uygulanan küçük bir akımla Kollektör (C) ile Emiter (E) arasındaki çok daha büyük akımı kontrol eden yarı iletken elemandır.',
    analogy:
      'Küçük bir parmak hareketiyle dev bir su barajının ana vanasını açıp kapatan akım kontrollü hidrolik valf gibidir.',
    pins: '3 uçlu: Beyz (B - kontrol), Kollektör (C - akım girişi), Emiter (E - akım çıkışı, oklu bacak).',
    practicalTip:
      'Beyz ucuna her zaman seri bir akım sınırlama direnci (örneğin 1 kΩ – 10 kΩ) bağla; V_BE ≈ 0.7 V olduğunda transistör iletime geçer.',
    typicalValues: '2N2222, BC547, 2N3904 (β = hFE ≈ 100–300)',
  },

  bjt_pnp: {
    title: 'PNP Transistör (BJT PNP)',
    shortDesc:
      'NPN’in tamamlayıcısıdır; Beyz ucu Emiter’den yaklaşık 0.7 V daha düşük yapıldığında Emiter’den Kollektör’e akım akıtır.',
    analogy:
      'Basıncı artırmak yerine kontrol hattındaki basıncı düşürünce açılan üstten beslemeli (high-side) su vanası gibidir.',
    pins: '3 uçlu: Beyz (B), Emiter (E - beslemeye yakın, ok içeri bakar), Kollektör (C - yüke giden uç).',
    practicalTip:
      'Yükün artı (+) besleme tarafını anahtarlamak (high-side switching) veya NPN ile birlikte push-pull çıkış katı kurmak için kullanılır.',
    typicalValues: '2N2907, BC557, 2N3906 (β = hFE ≈ 100–250)',
  },

  nmos: {
    title: 'N-Kanal MOSFET (NMOS)',
    shortDesc:
      'Kapı (Gate) ucuna uygulanan gerilim eşik değerini (Vth) aştığında Drain ile Source arasında çok düşük dirençle akım geçiren gerilim kontrollü anahtardır.',
    analogy:
      'Hiç su harcamadan sadece kapaktaki basınçla (gerilimle) açılan son derece verimli bir elektronik musluk gibidir.',
    pins: '3 uçlu: Gate (G - kontrol), Drain (D - yük tarafı), Source (S - toprak tarafı).',
    practicalTip:
      'Gate ucu çok yüksek empedanslıdır ve boşta kalırsa ortam gürültüsüyle rastgele açılıp kapanabilir; Gate ile Source arasına 10 kΩ–100 kΩ pull-down direnci bağla.',
    typicalValues: '2N7000 (küçük sinyal), IRLZ44N (lojik seviye güç, Vth ≈ 1.5–2 V)',
  },

  pmos: {
    title: 'P-Kanal MOSFET (PMOS)',
    shortDesc:
      'Gate gerilimi Source geriliminden eşik değeri kadar aşağı çekildiğinde Source’tan Drain’e akım geçiren gerilim kontrollü anahtardır.',
    analogy:
      'Üst depodan gelen hattı kontrol eden, kumanda basıncı düşünce açılan verimli bir vana gibidir.',
    pins: '3 uçlu: Gate (G), Source (S - artı besleme tarafı), Drain (D - yük tarafı).',
    practicalTip:
      'NMOS ile eşleşerek CMOS lojik kapıların (örneğin EVİRİCİ / NOT kapısı) üst yarısını oluşturur ve yüksek taraf (high-side) güç anahtarlamada kullanılır.',
    typicalValues: 'BS250 (küçük sinyal), IRF9540 (güç, Vth ≈ -2 V ila -4 V)',
  },

  opamp: {
    title: 'İşlemsel Yükselteç (Op-Amp)',
    shortDesc:
      'İki girişi (+ ve -) arasındaki gerilim farkını çok yüksek bir katsayıyla yükselten, geri besleme ile yükselteç, filtre ve karşılaştırıcı yapılabilen temel analog bloktur.',
    analogy:
      'İki terazi kefesindeki en ufak ağırlık farkını bile devasa bir güçle dengelemeye çalışan son derece hassas bir kontrol ustası gibidir.',
    pins: '3 sinyal ucu: Evirmeyen giriş (+), Eviren giriş (-) ve Çıkış (OUT). Gerçek çiplerde ayrıca +V ve -V besleme pinleri vardır.',
    practicalTip:
      'Negatif geri besleme (çıkıştan "-" girişe direnç/tel) kurduğunda op-amp iki girişin gerilimini birbirine eşit tutmaya çalışır; geri beslemesiz bırakırsan karşılaştırıcı olarak raylara doyuma gider.',
    typicalValues: 'LM358, TL072, LM741, NE5532 (A_OL ≈ 100.000+)',
  },

  vswitch: {
    title: 'Gerilim Kontrollü Anahtar (VSwitch)',
    shortDesc:
      'Kontrol uçlarındaki gerilim eşik değerini geçtiğinde anahtar uçlarını (1 ve 2) düşük dirençle birleştiren, altında ise açık devre yapan elektronik anahtardır.',
    analogy:
      'Uzaktan kumanda sinyaliyle çalışan bir röle veya otomatik elektrik şalteri gibidir.',
    pins: '4 uçlu: Kontrol uçları (C+ ve C-) ve Anahtar kontakları (1 ve 2).',
    practicalTip:
      'PWM kontrolü, röle simülasyonu ve zamanlamalı devre geçişlerini hızlıca modellemek için idealdir; rOn (açık direnç) ve vThreshold değerlerini devrene göre ayarla.',
    typicalValues: 'vThreshold = 2.5 V, rOn = 0.1 Ω, rOff = 10 MΩ',
  },

  ground: {
    title: 'Toprak / Referans Düğümü (GND)',
    shortDesc:
      'Devredeki tüm gerilimlerin ölçüldüğü 0 Volt referans noktası ve akımın dönüş hattıdır.',
    analogy:
      'Haritalardaki "deniz seviyesi (0 metre)" gibidir; dağların yüksekliği deniz seviyesine göre ölçüldüğü gibi devre gerilimleri de toprağa göre ölçülür.',
    pins: '1 uçlu (0 - üstteki bağlantı noktası).',
    practicalTip:
      'Her devrede en az bir GND bulunmalıdır! Simülasyonda veya gerçek devrede farklı alt devrelerin (örneğin Arduino ile sensörün) GND hatlarını mutlaka birbirine bağla.',
    typicalValues: 'Sabit 0 V referans',
  },
};
