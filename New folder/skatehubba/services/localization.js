import * as Localization from 'expo-localization';
import i18n from 'i18n-js';

import en from '../localization/en.json';
import es from '../localization/es.json';

i18n.translations = { en, es };
i18n.locale = Localization.locale;
i18n.fallbacks = true;

export default i18n;
