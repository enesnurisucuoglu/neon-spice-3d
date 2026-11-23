import { LevelQuizQuestion } from '../types/academy';

export const ACADEMY_QUIZZES: Record<number, LevelQuizQuestion> = {
  // ==========================================================================
  // BÖLÜM 1: İLK ELEKTRİK KIVILCIMI (L1–L5)
  // ==========================================================================
  1: {
    question: '5V bir pilin uçlarına 1 kΩ direnç bağlandığında Ohm Kanunu’na göre devreden kaç mA akım geçer?',
    options: ['0.5 mA', '5 mA', '50 mA', '500 mA'],
    correctIndex: 1,
    explanation:
      'Ohm Kanunu I = V / R olduğundan I = 5 V / 1000 Ω = 0.005 A = 5 mA çıkar.',
  },
  2: {
    question: 'Gerilim sabit kalırken devredeki direnç değeri yarıya indirilirse akım nasıl değişir?',
    options: [
      'Yarıya düşer',
      'Değişmez',
      'İki katına çıkar',
      'Dört katına çıkar',
    ],
    correctIndex: 2,
    explanation:
      'I = V / R formülüne göre akım dirençle ters orantılıdır; direnç yarıya inince akım tam iki katına çıkar.',
  },
  3: {
    question: '5V bir güç kaynağına kırmızı LED bağlarken neden mutlaka seri bir direnç eklemeliyiz?',
    options: [
      'LED’in rengini değiştirmek için',
      'Aşırı akımı sınırlayıp LED’in yanmasını önlemek için',
      'DC gerilimi AC’ye çevirmek için',
      'Pil ömrünü sıfırlamak için',
    ],
    correctIndex: 1,
    explanation:
      'LED iletime geçtiğinde çok düşük direnç gösterir; seri direnç olmadan akım kontrolsüz büyür ve LED anında yanar.',
  },
  4: {
    question: '9V pil ile yeşil LED (~2.2V) sürerken 5V’a göre neden daha büyük bir seri direnç gerekir?',
    options: [
      'Yeşil LED’ler ters bağlandığı için',
      'Direnç üzerinde düşecek fazla gerilim (9V - 2.2V = 6.8V) arttığı için',
      '9V piller sadece yüksek dirençle çalıştığı için',
      'Akımı 100 mA üzerine çıkarmak için',
    ],
    correctIndex: 1,
    explanation:
      'Besleme gerilimi arttıkça direnç üzerindeki gerilim (V_kaynak - V_LED) artar; aynı güvenli 15–20 mA akımı korumak için R büyütülmelidir.',
  },
  5: {
    question: '12V kaynakta 1A sigorta (F1) kullanılıyorsa, sigortanın atmaması için yük direnci en az kaç Ω olmalıdır?',
    options: ['2 Ω', '5 Ω', '12 Ω’dan büyük', '0.5 Ω'],
    correctIndex: 2,
    explanation:
      'R = V / I = 12 V / 1 A = 12 Ω kritik sınırdır; sigortanın güvenle sağlam kalması için yük direnci 12 Ω’dan büyük (örneğin 22 Ω) seçilmelidir.',
  },

  // ==========================================================================
  // BÖLÜM 2: SERİ, PARALEL VE GERİLİM BÖLÜCÜ (L6–L10)
  // ==========================================================================
  6: {
    question: '1 kΩ ve 4 kΩ’luk iki direnç seri bağlandığında toplam eşdeğer direnç ne olur?',
    options: ['800 Ω', '3 kΩ', '5 kΩ', '4 kΩ'],
    correctIndex: 2,
    explanation:
      'Seri bağlı dirençler doğrudan toplanır: R_toplam = R1 + R2 = 1 kΩ + 4 kΩ = 5 kΩ.',
  },
  7: {
    question: '10V girişli bir gerilim bölücüde R1 = R2 seçilirse çıkış gerilimi V_OUT kaç Volt olur?',
    options: ['2.5 V', '5.0 V', '7.5 V', '10.0 V'],
    correctIndex: 1,
    explanation:
      'V_OUT = V_IN · R2 / (R1 + R2) formülünde R1 = R2 olduğunda gerilim tam yarıya bölünür (10V / 2 = 5.0V).',
  },
  8: {
    question: '9V pil gerilimini 3.3V mikrodenetleyici (MCU) girişine düşürürken neden 10 kΩ gibi yüksek dirençler seçilir?',
    options: [
      'Bölücünün pilden gereksiz yüksek akım çekip pili bitirmemesi için',
      'Düşük dirençler gerilimi bölemediği için',
      'MCU sadece 10 kΩ dirençleri tanıdığı için',
      'Çıkış gerilimini 9V’ta tutmak için',
    ],
    correctIndex: 0,
    explanation:
      'Yüksek değerli bölücü dirençleri (ör. 10 kΩ + 5.8 kΩ) akımı mikroamper/sub-miliamper düzeyinde tutarak batarya ömrünü korur.',
  },
  9: {
    question: 'İki adet 1 kΩ direnç birbirine paralel bağlandığında eşdeğer direnç kaç Ω olur?',
    options: ['2 kΩ', '1 kΩ', '500 Ω', '250 Ω'],
    correctIndex: 2,
    explanation:
      'Eşit iki direnç paralel bağlandığında akıma iki özdeş yol açılır ve eşdeğer direnç yarıya (1000 / 2 = 500 Ω) düşer.',
  },
  10: {
    question: 'Potansiyometre ile ayarlanabilir gerilim bölücü yaparken çıkış gerilimi hangi uçtan alınır?',
    options: [
      'Yalnızca Toprak (GND) ucundan',
      'Orta hareketli uçtan (Wiper / W)',
      'Sadece artı besleme ucundan',
      'İki sabit ucun kısa devre edilmesinden',
    ],
    correctIndex: 1,
    explanation:
      'Sabit uçlar besleme ile toprağa bağlanır; hareketli orta uç (Wiper) direnç oranını değiştirerek 0V ile V_IN arasında ayarlanabilir gerilim verir.',
  },

  // ==========================================================================
  // BÖLÜM 3: DİYOTLAR — TEK YÖNLÜ VALF (L11–L15)
  // ==========================================================================
  11: {
    question: 'Standart bir silikon diyot (ör. 1N4148) ileri yönde iletime geçtiğinde üzerinde yaklaşık kaç Volt gerilim düşer?',
    options: ['0.05 V', '0.6 – 0.7 V', '2.5 V', '5.0 V'],
    correctIndex: 1,
    explanation:
      'Silikon PN ekleminin ileri iletim eşiği yaklaşık 0.6V – 0.7V’tur ve akım geniş bir aralıkta değişse bile bu düşüm neredeyse sabit kalır.',
  },
  12: {
    question: 'Seri koruma diyotu bulunan bir devreye pil yanlışlıkla ters (-5V) bağlanırsa ne olur?',
    options: [
      'Diyot ters polarlı olduğu için akımı keser ve devreyi korur',
      'Akım iki katına çıkar',
      'Diyot gerilimi +5V’a çevirir',
      'Direnç değeri sıfıra düşer',
    ],
    correctIndex: 0,
    explanation:
      'Diyot tek yönlü valf gibi davranır; ters polarma altında kesime giderek ters akımın hassas devrelere zarar vermesini önler.',
  },
  13: {
    question: 'Pil beslemeli devrelerde standart silikon diyot yerine Schottky diyot seçilmesinin en büyük avantajı nedir?',
    options: [
      'Daha yüksek gerilim düşürmesi (~2V)',
      'Çok daha düşük ileri gerilim düşümü (~0.2–0.3V) ile daha az enerji kaybı',
      'Sadece DC akımı kesmesi',
      'Yönünün fark etmemesi',
    ],
    correctIndex: 1,
    explanation:
      'Schottky diyotlar ~0.2–0.3V gerilim düşürdüğü için 5V veya 3.3V sistemlerde enerji kaybını ve ısınmayı ciddi oranda azaltır.',
  },
  14: {
    question: 'Mavi bir LED (~3.0V eşik) 2V’luk bir kaynağa bağlandığında neden ışık vermez?',
    options: [
      '2V kaynağı mavi LED’in ileri iletim eşik geriliminin (~3.0V) altında kaldığı için',
      'Mavi LED’ler sadece AC ile çalıştığı için',
      '220 Ω direnç çok küçük olduğu için',
      'Mavi LED’in katotu artıya bağlandığı için',
    ],
    correctIndex: 0,
    explanation:
      'Her LED renginin farklı bant aralığı vardır; mavi/beyaz LED’lerin iletime geçebilmesi için kaynak gerilimi ~3.0V eşiğini aşmalıdır.',
  },
  15: {
    question: '5.1V Zener diyotlu bir regülatörde Zener diyot devreye nasıl bağlanır?',
    options: [
      'İleri yönde (Anot artıya, Katot toprağa)',
      'Ters yönde (Katot çıkışa/artıya, Anot toprağa) ve seri akım sınırlama direnciyle',
      'Seri direnç olmadan doğrudan güç kaynağına paralel',
      'Yalnızca toprağa seri olarak',
    ],
    correctIndex: 1,
    explanation:
      'Zener diyot ters kırılma bölgesinde gerilimi sabitler; Katot pozitif düğüme, Anot toprağa bağlanır ve akım mutlaka seri dirençle (R_S) sınırlanır.',
  },

  // ==========================================================================
  // BÖLÜM 4: KAPASİTÖR & ZAMAN SABİTİ (L16–L20)
  // ==========================================================================
  16: {
    question: 'Bir RC devresinde kapasitörün neredeyse tamamen (%99.3) şarj olması için yaklaşık kaç zaman sabiti (τ = R·C) geçmelidir?',
    options: ['0.5τ', '1τ', '2τ', '5τ'],
    correctIndex: 3,
    explanation:
      'Üstel şarj eğrisi v(t) = V(1 - e^(-t/τ)) gereği 1τ’da %63.2, 5τ’da ise %99.3 doluluğa ulaşılır (5τ kuralı).',
  },
  17: {
    question: 'R = 10 kΩ ve C = 100 nF olan bir RC gecikme devresinin zaman sabiti (τ) nedir?',
    options: ['0.01 ms', '0.1 ms', '1 ms', '10 ms'],
    correctIndex: 2,
    explanation:
      'τ = R · C = 10.000 Ω × 100 × 10⁻⁹ F = 0.001 s = 1 ms olur; t = 1 ms anında kapasitör beslemenin %63.2’sine ulaşır.',
  },
  18: {
    question: 'Pasif RC alçak geçiren filtrede (LPF) kesim frekansı f_c = 1 / (2πRC) noktasında sinyal kazancı kaç dB düşer?',
    options: ['0 dB', '-3 dB', '-20 dB', '-40 dB'],
    correctIndex: 1,
    explanation:
      'Kesim frekansında çıkış genliği girişin 1/√2 ≈ 0.707 katına (yarı güce) iner; bu da 20·log10(0.707) = -3.01 dB’dir.',
  },
  19: {
    question: 'Seri kapasitör (C) ve toprağa bağlı dirençten (R) oluşan RC yüksek geçiren filtre DC sinyale nasıl davranır?',
    options: [
      'DC sinyali kayıpsız geçirir',
      'DC sinyali 2 kat yükseltir',
      'DC sinyali tamamen engeller (açık devre gibi davranır)',
      'DC sinyali kare dalgaya çevirir',
    ],
    correctIndex: 2,
    explanation:
      'Kapasitörün reaktansı X_C = 1/(2πfC) f = 0 Hz (DC) için sonsuzdur; bu yüzden yüksek geçiren filtre DC bileşeni tamamen keser.',
  },
  20: {
    question: 'Bir PWM veya kare dalga sinyalini RC filtreden geçirerek yumuşatmak için zaman sabiti τ nasıl seçilmelidir?',
    options: [
      'Sinyal periyodundan çok daha küçük (τ ≪ T)',
      'Sinyal periyoduna yakın veya ondan büyük (τ ≥ T/2)',
      'Sıfır (R = 0 Ω)',
      'Kapasitör çıkarılarak',
    ],
    correctIndex: 1,
    explanation:
      'τ, kare dalganın darbe süresine yakın veya büyük seçildiğinde kapasitör her darbede tam dolup boşalamaz ve dalgayı pürüzsüzleştirir.',
  },

  // ==========================================================================
  // BÖLÜM 5: İNDÜKTÖR, RLC REZONANS VE TRAFO (L21–L25)
  // ==========================================================================
  21: {
    question: 'Bir indüktörün (bobinin) AC sinyallere gösterdiği direnç (X_L = 2πfL) frekans arttıkça nasıl değişir?',
    options: [
      'Frekans arttıkça doğrusal olarak artar',
      'Frekans arttıkça azalır',
      'Frekansla değişmez',
      'Sadece DC’de sonsuz olur',
    ],
    correctIndex: 0,
    explanation:
      'İndüktör akımın hızlı değişimine karşı koyar; X_L = 2πfL olduğundan yüksek frekanslarda büyük empedans göstererek onları engeller.',
  },
  22: {
    question: 'Seri RLC devresinde rezonans frekansında (f₀ = 1 / (2π√(LC))) bobin ve kapasitörün reaktanslarına ne olur?',
    options: [
      'İkisi de sonsuz olur',
      'Büyüklükleri eşitlenir (X_L = X_C) ve birbirlerini tam olarak sıfırlar',
      'Direnç değeri sıfırlanır',
      'Çıkış gerilimi sıfır olur',
    ],
    correctIndex: 1,
    explanation:
      'Rezonansta endüktif (+jX_L) ve kapasitif (-jX_C) reaktanslar zıt fazlı ve eşit olduğu için birbirini götürür; devre saf direnç (Z = R) gibi davranır.',
  },
  23: {
    question: 'Seri RLC band-geçiren filtrede direnç (R) küçültüldüğünde kalite faktörü (Q = ω₀L / R) ve seçicilik nasıl değişir?',
    options: [
      'Q düşer ve bant genişler',
      'Q yükselir, rezonans tepesi daha keskin ve seçici hale gelir',
      'Rezonans frekansı iki katına çıkar',
      'Filtre alçak geçiren filtreye dönüşür',
    ],
    correctIndex: 1,
    explanation:
      'Q = ω₀L / R olduğundan R azaldıkça Q büyür; bant genişliği (BW = f₀/Q) daralır ve rezonans dışındaki frekanslar çok daha sert bastırılır.',
  },
  24: {
    question: '170 Vpk AC girişe sahip bir trafonun sarım oranı turnsRatio (Ns/Np) = 0.1 ise sekonder tepe gerilimi kaç Vpk olur?',
    options: ['1.7 Vpk', '17 Vpk', '85 Vpk', '1700 Vpk'],
    correctIndex: 1,
    explanation:
      'İdeal trafoda V_sec = (Ns/Np) · V_pri = 0.1 × 170 Vpk = 17 Vpk elde edilir.',
  },
  25: {
    question: 'Tek diyotlu yarım dalga doğrultucu AC sinüs dalgasının negatif yarı periyodunda çıkışa ne gönderir?',
    options: [
      'Negatif dalgayı pozitife çevirir',
      'Diyot ters polarlı olduğu için akımı keser ve çıkış 0V’ta kalır',
      'Negatif dalgayı iki kat büyütür',
      'Sabit -10V gönderir',
    ],
    correctIndex: 1,
    explanation:
      'Yarım dalga doğrultucuda diyot yalnızca pozitif yarı periyotta iletir; negatif yarıda kesime giderek çıkışı 0V’ta tutar.',
  },

  // ==========================================================================
  // BÖLÜM 6: GÜÇ ELEKTRONİĞİ: DOĞRULTMA & ANAHTARLAMA (L26–L30)
  // ==========================================================================
  26: {
    question: '4 diyotlu tam dalga köprü doğrultucuda her yarı periyotta akım kaç diyot üzerinden seri geçer?',
    options: ['1 diyot', '2 diyot', '3 diyot', '4 diyot'],
    correctIndex: 1,
    explanation:
      'Pozitif yarıda iki diyot, negatif yarıda diğer iki diyot iletime geçer; bu yüzden çıkış tepesi V_peak - 2·V_f civarında olur.',
  },
  27: {
    question: 'Doğrultucu çıkışına paralel büyük bir filtre kapasitörü eklendiğinde çıkış dalgalanması (ripple) nasıl değişir?',
    options: [
      'Dalgalanma (Vpp) belirgin şekilde azalır ve çıkış düz DC’ye yaklaşır',
      'Dalgalanma artar',
      'Çıkış gerilimi sıfırlanır',
      'Frekans 10 kat artar',
    ],
    correctIndex: 0,
    explanation:
      'Kapasitör tepe anında şarj olur ve dalga düşerken yükü beslemeye devam ederek dalgalanmayı (ΔV ≈ I / (2fC)) küçültür.',
  },
  28: {
    question: 'Düşük gerilimli trafolu bir güç kaynağında köprü doğrultucuda Schottky diyot kullanmak ne kazandırır?',
    options: [
      'Frekansı değiştirir',
      'İki seri diyot kaybını ~1.4V’tan ~0.5V’a indirerek verimliliği ve çıkış gerilimini artırır',
      'Trafoyu ortadan kaldırır',
      'AC çıkışı sinüs yapar',
    ],
    correctIndex: 1,
    explanation:
      'Köprüde her an 2 diyot seri ilettiğinden Schottky diyot seçimi yaklaşık 0.9V gerilim ve önemli ısı tasarrufu sağlar.',
  },
  29: {
    question: '2V DC kaynakla öngerilimlenmiş (biased) paralel silikon diyot kırpıcı devresi pozitif tepeyi yaklaşık hangi seviyede kırpar?',
    options: ['0.65 V', '2.0 V', '2.65 V (V_bias + V_f)', '5.0 V'],
    correctIndex: 2,
    explanation:
      'Giriş gerilimi V_bias + V_f ≈ 2.0 + 0.65 = 2.65V değerini aştığında diyot iletime geçip çıkışı bu seviyede sabitler.',
  },
  30: {
    question: 'Voltaj kontrollü anahtar (veya röle) devresinin 5V mikrodenetleyici ile 12V lamba sürmedeki temel görevi nedir?',
    options: [
      'Düşük güçlü kontrol sinyaliyle yüksek gerilimli/akımlı yükü güvenle açıp kapamak',
      '12V lambayı 1V’a düşürmek',
      'AC sinyali filtrelemek',
      'Direnç ölçmek',
    ],
    correctIndex: 0,
    explanation:
      'Anahtar/röle, hassas kontrol devresini yüksek güçlü yük hattından ayırarak küçük bir kontrol gerilimiyle büyük yükleri yönetir.',
  },

  // ==========================================================================
  // BÖLÜM 7: BJT TRANSİSTÖRLER: NPN & PNP (L31–L35)
  // ==========================================================================
  31: {
    question: 'NPN bir BJT transistörün dijital anahtar olarak iletime geçmesi için Beyz-Emiter gerilimi (V_BE) yaklaşık kaç Volt olmalıdır?',
    options: ['0 V', '~0.7 V', '-5 V', '12 V'],
    correctIndex: 1,
    explanation:
      'NPN transistörün Beyz-Emiter eklemi bir silikon diyot gibidir; V_BE ≈ 0.65–0.7V olduğunda beyz akımı akar ve transistör açılır.',
  },
  32: {
    question: 'NPN transistörü tam doyuma (saturation) sokup anahtar gibi çalıştırırken baz direnci R_B neden çok büyük seçilmemelidir?',
    options: [
      'R_B çok büyük olursa I_B yetersiz kalır ve transistör tam iletime geçemez',
      'R_B büyük olursa transistör patlar',
      'R_B büyüdükçe kollektör akımı sonsuza gider',
      'Baz direncinin akıma etkisi yoktur',
    ],
    correctIndex: 0,
    explanation:
      'Doyumda I_C akımını tam taşıyabilmek için yeterli beyz akımı (I_B ≥ I_C / β_zorlanmış) gerekir; aşırı büyük R_B transistörü lineer bölgede bırakır.',
  },
  33: {
    question: 'Emiter takipçi (Ortak Kollektör) devresinde çıkış gerilimi V_E, giriş gerilimi V_B ile nasıl ilişkilidir?',
    options: [
      'V_E ≈ -10 · V_B',
      'V_E ≈ V_B - 0.7 V (gerilim kazancı ~1, yüksek akım tamponu)',
      'V_E = 0 V',
      'V_E = 2 · V_B',
    ],
    correctIndex: 1,
    explanation:
      'Emiter gerilimi beyz gerilimini yaklaşık bir diyot düşümü (0.7V) geriden takip eder; yüksek giriş empedansı ve güçlü akım çıkışı sunar.',
  },
  34: {
    question: 'Ortak emiterli bir BJT yükselteçte DC çalışma noktasında V_CE gerilimi neden genellikle beslemenin (VCC) yaklaşık yarısına ayarlanır?',
    options: [
      'Transistörü kesimde tutmak için',
      'AC sinyalin hem pozitif hem negatif yönde kırpılmadan maksimum salınım yapabilmesi için',
      'Güç tüketimini sıfırlamak için',
      'Diyot etkisini yok etmek için',
    ],
    correctIndex: 1,
    explanation:
      'V_CE ≈ VCC/2 seçildiğinde çıkış dalgası yukarıda VCC’ye, aşağıda doyuma eşit mesafede olur ve bozulmasız en büyük genliği verir.',
  },
  35: {
    question: 'Emiteri +12V’a bağlı bir PNP yüksek taraf (high-side) anahtarı iletime geçirmek için Beyz gerilimi nasıl yapılmalıdır?',
    options: [
      '+12V’a eşit yapılmalıdır',
      'Emiterden en az ~0.7V daha düşük (ör. 0V/GND’ye doğru çekilmiş) yapılmalıdır',
      '+24V’a yükseltilmelidir',
      'Boşta bırakılmalıdır',
    ],
    correctIndex: 1,
    explanation:
      'PNP transistörde akım Emiter’den Beyz’e doğru aktığında iletim başlar; yani V_EB ≥ 0.7V (V_B ≤ V_E - 0.7V) olmalıdır.',
  },

  // ==========================================================================
  // BÖLÜM 8: MOSFET & DİJİTAL CMOS ELEKTRONİĞİ (L36–L40)
  // ==========================================================================
  36: {
    question: 'Vth = 1.5V eşik gerilimine sahip bir NMOS transistörün iletime geçebilmesi için V_GS gerilimi ne olmalıdır?',
    options: ['0 V', '1.0 V', '1.5 V’tan büyük (ör. 3.3V veya 5V)', '-5 V'],
    correctIndex: 2,
    explanation:
      'NMOS kanalı ancak Gate-Source gerilimi eşik değerini aştığında (V_GS > Vth) oluşur ve Drain-Source arası iletime geçer.',
  },
  37: {
    question: '12V güçlü bir lambayı anahtarlamak için BJT yerine NMOS MOSFET kullanmanın en büyük avantajlarından biri nedir?',
    options: [
      'Gate ucu neredeyse hiç sürekli DC akım çekmez (gerilim kontrollüdür) ve R_DS(on) çok düşüktür',
      'MOSFET’in 2 bacağı vardır',
      'MOSFET sadece 100V üzerinde çalışır',
      'Toprak bağlantısına gerek duymaz',
    ],
    correctIndex: 0,
    explanation:
      'MOSFET’in yalıtılmış oksit kapısı (Gate) sürekli akım çekmez; düşük iletim direnci sayesinde yüksek akımda çok az ısınır.',
  },
  38: {
    question: 'NMOS PWM LED sürücü devresinde LED parlaklığı hangi parametre değiştirilerek ayarlanır?',
    options: [
      'Toprak kablosunun rengiyle',
      'Kare dalganın görev döngüsüyle (Duty Cycle = darbe genişliği / periyot)',
      'Sadece seri bobin ekleyerek',
      'LED’i ters bağlayarak',
    ],
    correctIndex: 1,
    explanation:
      'Yüksek frekanslı PWM anahtarlamada LED’in açık kalma oranı (Duty Cycle) arttıkça ortalama akım ve algılanan parlaklık artar.',
  },
  39: {
    question: 'Source ucu +12V’a bağlı bir PMOS yüksek taraf anahtarını KAPATMAK (kesime sokmak) için Gate gerilimi kaç Volt olmalıdır?',
    options: ['0 V', '5 V', '12 V (Source ile aynı gerilim, V_SG = 0V)', '-12 V'],
    correctIndex: 2,
    explanation:
      'PMOS, V_SG = V_S - V_G eşiği aştığında açılır; Gate’i Source ile aynı gerilime (12V) çektiğinde V_SG = 0V olur ve PMOS tamamen kapanır.',
  },
  40: {
    question: 'Bir CMOS EVİRİCİ (NOT kapısı) girişine HIGH (+5V) uygulandığında hangi transistör iletimde olur ve çıkış ne olur?',
    options: [
      'PMOS iletimde, çıkış +5V olur',
      'NMOS iletimde, PMOS kesimde ve çıkış 0V (LOW) olur',
      'İki transistör de kısa devre olur',
      'İki transistör de kesimde kalır',
    ],
    correctIndex: 1,
    explanation:
      'V_IN = 5V iken NMOS açılıp çıkışı GND’ye (0V) çeker, PMOS ise kapanır; böylece statik durumda neredeyse sıfır güç harcanır!',
  },

  // ==========================================================================
  // BÖLÜM 9: OP-AMP ANALOG DEVRE TASARIMI (L41–L45)
  // ==========================================================================
  41: {
    question: 'Gerilim kazancı 1 olan Op-Amp Gerilim İzleyici (Unity-Gain Buffer) gerçek devrelerde neden kullanılır?',
    options: [
      'Gerilimi 10 kat yükseltmek için',
      'Hassas bir kaynağı (ör. gerilim bölücüyü) yükün çekeceği akımdan yalıtıp gerilim çökmesini önlemek için',
      'Sinyalin fazını 180° ters çevirmek için',
      'DC gerilimi kesmek için',
    ],
    correctIndex: 1,
    explanation:
      'Tampon devresi çok yüksek giriş empedansı ve çok düşük çıkış empedansı sunarak hassas sinyalleri yükleme etkisi olmadan sürer.',
  },
  42: {
    question: 'Eviren (Inverting) Op-Amp yükselteçte R_in = 1 kΩ ve R_f = 4.7 kΩ ise kapalı çevrim gerilim kazancı nedir?',
    options: ['+4.7', '-4.7', '+5.7', '-0.21'],
    correctIndex: 1,
    explanation:
      'Eviren yükselteç kazancı A_v = -R_f / R_in = -4.7k / 1k = -4.7’dir; eksi işareti 180° faz terslemesini gösterir.',
  },
  43: {
    question: 'Evirmeyen (Non-Inverting) Op-Amp yükselteçte R1 = 1 kΩ ve R_f = 10 kΩ ise gerilim kazancı kaç olur?',
    options: ['10×', '11×', '-10×', '1×'],
    correctIndex: 1,
    explanation:
      'Evirmeyen yükselteç kazancı A_v = 1 + (R_f / R1) = 1 + 10k / 1k = 11×’dir ve giriş ile çıkış aynı fazdadır.',
  },
  44: {
    question: '±15V besleme raylarına sahip bir Op-Amp’tan teorik olarak 25V çıkış almaya çalışırsak ne olur?',
    options: [
      'Op-Amp otomatik olarak 25V üretir',
      'Çıkış ±15V besleme raylarında kırpılır (ray doyumu / clipping)',
      'Op-Amp frekansı iki katına çıkarır',
      'Kazanç sıfıra düşer',
    ],
    correctIndex: 1,
    explanation:
      'Bir yükselteç asla kendi besleme geriliminden daha büyük çıkış veremez; aşırı genlikte dalganın tepeleri düzleşerek kırpılır.',
  },
  45: {
    question: 'Ses elektroniğinde 20 dB’lik bir gerilim kazancı doğrusal (V/V) olarak kaç kat yükseltmeye karşılık gelir?',
    options: ['2×', '5×', '10×', '100×'],
    correctIndex: 2,
    explanation:
      'Desibel gerilim formülü dB = 20·log10(|A_v|) olduğundan 20·log10(10) = 20 dB (yani 10× kazanç) elde edilir.',
  },

  // ==========================================================================
  // BÖLÜM 10: ORTA SEVİYE BİTİRME PROJELERİ (L46–L50)
  // ==========================================================================
  46: {
    question: 'Aktif Op-Amp alçak geçiren filtrenin pasif RC filtreye göre en büyük avantajı nedir?',
    options: [
      'Hem geçiş bandında kazanç sağlayabilmesi hem de çıkış yükünden etkilenmemesi (tamponlu olması)',
      'Hiç direnç gerektirmemesi',
      'Sadece 60 Hz’de çalışması',
      'Besleme gerilimine ihtiyaç duymaması',
    ],
    correctIndex: 0,
    explanation:
      'Aktif filtreler op-amp sayesinde sinyali zayıflatmadan yükseltebilir ve sonraki katların yükleme etkisini ortadan kaldırır.',
  },
  47: {
    question: '2. derece Sallen-Key Butterworth alçak geçiren filtrenin durdurma bandı eğimi (roll-off) dekad başına kaç dB’dir?',
    options: ['-6 dB/dekad', '-20 dB/dekad', '-40 dB/dekad', '-100 dB/dekad'],
    correctIndex: 2,
    explanation:
      'Her filtre derecesi -20 dB/dekad zayıflama ekler; 2. derece Sallen-Key filtre kesim frekansı üzerinde -40 dB/dekad ile çok daha keskin kesim sağlar.',
  },
  48: {
    question: 'Ortak emiterli BJT ses ön yükseltecinin giriş ve çıkışındaki kuplaj kapasitörleri (C_IN, C_OUT) ne işe yarar?',
    options: [
      'AC ses sinyalini geçirirken transistörün DC öngerilim (bias) noktasını bozulmaktan korur',
      'DC gerilimi yükseltir',
      'Sesi tamamen keser',
      'Transistörü MOSFET’e dönüştürür',
    ],
    correctIndex: 0,
    explanation:
      'Kuplaj kapasitörleri DC için açık devre, ses frekansları (AC) için kısa devre gibi davranarak katlar arası DC izolasyonu sağlar.',
  },
  49: {
    question: 'Transkondüktansı gm = 10 mS (0.01 A/V) olan bir VCCS kaynağına 2V kontrol gerilimi uygulanırsa kaç mA çıkış akımı üretir?',
    options: ['2 mA', '5 mA', '20 mA', '200 mA'],
    correctIndex: 2,
    explanation:
      'VCCS çıkış akımı I_out = gm · V_ctrl = 0.01 A/V × 2 V = 0.02 A = 20 mA olur.',
  },
  50: {
    question: 'Mezuniyet Projesinde 5.1V Zener referansının çıkışına neden bir Op-Amp gerilim izleyici (tampon) ekliyoruz?',
    options: [
      'Zener gerilimini 12V’a çıkarmak için',
      'Yük akımı değişse bile Zener’den çekilen akımı sabit tutup çıkış geriliminin çökmesini önlemek için',
      'Zener diyotu ters çevirmek için',
      'Devreyi AC kaynağa çevirmek için',
    ],
    correctIndex: 1,
    explanation:
      'Op-amp girişi neredeyse hiç akım çekmediği için Zener her zaman sabit ideal akımda çalışır; yük akımını ise op-amp çıkış katı güvenle karşılar!',
  },
};

export function getQuizForLevel(levelId: number): LevelQuizQuestion {
  return (
    ACADEMY_QUIZZES[levelId] ?? {
      question: 'Ohm Kanunu’na göre gerilim (V), akım (I) ve direnç (R) arasındaki temel bağıntı nedir?',
      options: ['V = I · R', 'V = I / R', 'V = R / I', 'V = I + R'],
      correctIndex: 0,
      explanation: 'Ohm Kanunu V = I · R olarak ifade edilir.',
    }
  );
}
