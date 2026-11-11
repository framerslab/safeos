/**
 * Internationalization (i18n) Module
 *
 * Multi-language support for SafeOS Guardian.
 *
 * @module lib/i18n
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

export type Locale = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ja' | 'pt' | 'ar' | 'hi' | 'ko';

export interface I18nStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

// =============================================================================
// Translations
// =============================================================================

// Define translations first, then derive TranslationKey from it
const translationsData = {
  en: {
    // Common
    'common.loading': 'Loading...',
    'common.error': 'An error occurred',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.skip': 'Skip',
    'common.continue': 'Continue',
    'common.close': 'Close',
    'common.search': 'Search',
    'common.settings': 'Settings',
    'common.help': 'Help',
    'common.logout': 'Log Out',
    'common.login': 'Log In',
    'common.signup': 'Sign Up',

    // Navigation
    'nav.home': 'Home',
    'nav.monitor': 'Monitor',
    'nav.history': 'History',
    'nav.settings': 'Settings',
    'nav.profiles': 'Profiles',
    'nav.analytics': 'Analytics',
    'nav.admin': 'Admin',
    'nav.help': 'Help',

    // Dashboard
    'dashboard.title': 'SafeOS Guardian',
    'dashboard.subtitle': 'Humanitarian AI Monitoring',
    'dashboard.systemStatus': 'System Status',
    'dashboard.quickActions': 'Quick Actions',
    'dashboard.activeStreams': 'Active Streams',
    'dashboard.noStreams': 'No active streams',
    'dashboard.startMonitoring': 'Start Monitoring',
    'dashboard.viewAlerts': 'View Alerts',

    // Monitor
    'monitor.title': 'Live Monitoring',
    'monitor.startStream': 'Start Stream',
    'monitor.stopStream': 'Stop Stream',
    'monitor.motionDetected': 'Motion Detected',
    'monitor.audioDetected': 'Audio Detected',
    'monitor.sensitivity': 'Sensitivity',
    'monitor.scenario': 'Monitoring Scenario',
    'monitor.pet': 'Pet Monitoring',
    'monitor.baby': 'Baby Monitoring',
    'monitor.elderly': 'Elderly Care',

    // Alerts
    'alerts.title': 'Alerts',
    'alerts.noAlerts': 'No alerts',
    'alerts.acknowledge': 'Acknowledge',
    'alerts.severity.critical': 'Critical',
    'alerts.severity.high': 'High',
    'alerts.severity.medium': 'Medium',
    'alerts.severity.low': 'Low',
    'alerts.severity.info': 'Info',

    // Settings
    'settings.title': 'Settings',
    'settings.profile': 'Profile Information',
    'settings.displayName': 'Display Name',
    'settings.preferences': 'Preferences',
    'settings.notifications': 'Notification Settings',
    'settings.motionSensitivity': 'Motion Sensitivity',
    'settings.audioSensitivity': 'Audio Sensitivity',
    'settings.theme': 'Theme',
    'settings.language': 'Language',

    // Auth
    'auth.welcome': 'Welcome to SafeOS Guardian',
    'auth.guestMode': 'Continue as Guest',
    'auth.email': 'Email Address',
    'auth.password': 'Password',
    'auth.confirmPassword': 'Confirm Password',
    'auth.forgotPassword': 'Forgot Password?',
    'auth.noAccount': "Don't have an account?",
    'auth.hasAccount': 'Already have an account?',

    // Onboarding
    'onboarding.welcome': 'Welcome to SafeOS Guardian',
    'onboarding.disclaimer': 'IMPORTANT DISCLAIMER',
    'onboarding.disclaimerText': 'SafeOS Guardian is a SUPPLEMENTARY monitoring tool only. It should never replace direct human care, professional medical monitoring, or parental supervision.',
    'onboarding.understand': 'I Understand and Accept',
    'onboarding.selectScenario': 'Choose Your Monitoring Scenario',
    'onboarding.grantPermissions': 'Grant Camera & Microphone Access',
    'onboarding.complete': 'Setup Complete',

    // Errors
    'error.generic': 'Something went wrong',
    'error.network': 'Network error. Please check your connection.',
    'error.unauthorized': 'Please log in to continue',
    'error.notFound': 'Page not found',
    'error.camera': 'Camera access denied',
    'error.microphone': 'Microphone access denied',

    // Footer
    'footer.disclaimer': 'Not a replacement for direct care',
    'footer.humanitarian': 'Humanitarian work',
  },

  es: {
    // Common
    'common.loading': 'Cargando...',
    'common.error': 'Ocurrió un error',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.edit': 'Editar',
    'common.confirm': 'Confirmar',
    'common.back': 'Atrás',
    'common.next': 'Siguiente',
    'common.skip': 'Omitir',
    'common.continue': 'Continuar',
    'common.close': 'Cerrar',
    'common.search': 'Buscar',
    'common.settings': 'Configuración',
    'common.help': 'Ayuda',
    'common.logout': 'Cerrar Sesión',
    'common.login': 'Iniciar Sesión',
    'common.signup': 'Registrarse',

    // Navigation
    'nav.home': 'Inicio',
    'nav.monitor': 'Monitor',
    'nav.history': 'Historial',
    'nav.settings': 'Configuración',
    'nav.profiles': 'Perfiles',
    'nav.analytics': 'Análisis',
    'nav.admin': 'Admin',
    'nav.help': 'Ayuda',

    // Dashboard
    'dashboard.title': 'SafeOS Guardian',
    'dashboard.subtitle': 'Monitoreo IA Humanitario',
    'dashboard.systemStatus': 'Estado del Sistema',
    'dashboard.quickActions': 'Acciones Rápidas',
    'dashboard.activeStreams': 'Transmisiones Activas',
    'dashboard.noStreams': 'Sin transmisiones activas',
    'dashboard.startMonitoring': 'Iniciar Monitoreo',
    'dashboard.viewAlerts': 'Ver Alertas',

    // Monitor
    'monitor.title': 'Monitoreo en Vivo',
    'monitor.startStream': 'Iniciar Transmisión',
    'monitor.stopStream': 'Detener Transmisión',
    'monitor.motionDetected': 'Movimiento Detectado',
    'monitor.audioDetected': 'Audio Detectado',
    'monitor.sensitivity': 'Sensibilidad',
    'monitor.scenario': 'Escenario de Monitoreo',
    'monitor.pet': 'Monitoreo de Mascotas',
    'monitor.baby': 'Monitoreo de Bebés',
    'monitor.elderly': 'Cuidado de Ancianos',

    // Alerts
    'alerts.title': 'Alertas',
    'alerts.noAlerts': 'Sin alertas',
    'alerts.acknowledge': 'Reconocer',
    'alerts.severity.critical': 'Crítico',
    'alerts.severity.high': 'Alto',
    'alerts.severity.medium': 'Medio',
    'alerts.severity.low': 'Bajo',
    'alerts.severity.info': 'Info',

    // Settings
    'settings.title': 'Configuración',
    'settings.profile': 'Información del Perfil',
    'settings.displayName': 'Nombre para Mostrar',
    'settings.preferences': 'Preferencias',
    'settings.notifications': 'Configuración de Notificaciones',
    'settings.motionSensitivity': 'Sensibilidad de Movimiento',
    'settings.audioSensitivity': 'Sensibilidad de Audio',
    'settings.theme': 'Tema',
    'settings.language': 'Idioma',

    // Auth
    'auth.welcome': 'Bienvenido a SafeOS Guardian',
    'auth.guestMode': 'Continuar como Invitado',
    'auth.email': 'Correo Electrónico',
    'auth.password': 'Contraseña',
    'auth.confirmPassword': 'Confirmar Contraseña',
    'auth.forgotPassword': '¿Olvidaste tu Contraseña?',
    'auth.noAccount': '¿No tienes una cuenta?',
    'auth.hasAccount': '¿Ya tienes una cuenta?',

    // Onboarding
    'onboarding.welcome': 'Bienvenido a SafeOS Guardian',
    'onboarding.disclaimer': 'AVISO IMPORTANTE',
    'onboarding.disclaimerText': 'SafeOS Guardian es SOLO una herramienta de monitoreo complementaria. Nunca debe reemplazar el cuidado humano directo, el monitoreo médico profesional o la supervisión parental.',
    'onboarding.understand': 'Entiendo y Acepto',
    'onboarding.selectScenario': 'Elige Tu Escenario de Monitoreo',
    'onboarding.grantPermissions': 'Otorgar Acceso a Cámara y Micrófono',
    'onboarding.complete': 'Configuración Completa',

    // Errors
    'error.generic': 'Algo salió mal',
    'error.network': 'Error de red. Verifica tu conexión.',
    'error.unauthorized': 'Inicia sesión para continuar',
    'error.notFound': 'Página no encontrada',
    'error.camera': 'Acceso a cámara denegado',
    'error.microphone': 'Acceso a micrófono denegado',

    // Footer
    'footer.disclaimer': 'No es un reemplazo del cuidado directo',
    'footer.humanitarian': 'Trabajo humanitario',
  },

  fr: {
    'common.loading': 'Chargement...',
    'common.error': 'Une erreur est survenue',
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.delete': 'Supprimer',
    'common.edit': 'Modifier',
    'common.confirm': 'Confirmer',
    'common.back': 'Retour',
    'common.next': 'Suivant',
    'common.skip': 'Passer',
    'common.continue': 'Continuer',
    'common.close': 'Fermer',
    'common.search': 'Rechercher',
    'common.settings': 'Paramètres',
    'common.help': 'Aide',
    'common.logout': 'Déconnexion',
    'common.login': 'Connexion',
    'common.signup': "S'inscrire",
    'nav.home': 'Accueil',
    'nav.monitor': 'Moniteur',
    'nav.history': 'Historique',
    'nav.settings': 'Paramètres',
    'nav.profiles': 'Profils',
    'nav.analytics': 'Analyses',
    'nav.admin': 'Admin',
    'nav.help': 'Aide',
    'dashboard.title': 'SafeOS Guardian',
    'dashboard.subtitle': 'Surveillance IA Humanitaire',
    'dashboard.systemStatus': 'État du Système',
    'dashboard.quickActions': 'Actions Rapides',
    'dashboard.activeStreams': 'Flux Actifs',
    'dashboard.noStreams': 'Aucun flux actif',
    'dashboard.startMonitoring': 'Démarrer la Surveillance',
    'dashboard.viewAlerts': 'Voir les Alertes',
    'monitor.title': 'Surveillance en Direct',
    'monitor.startStream': 'Démarrer le Flux',
    'monitor.stopStream': 'Arrêter le Flux',
    'monitor.motionDetected': 'Mouvement Détecté',
    'monitor.audioDetected': 'Audio Détecté',
    'monitor.sensitivity': 'Sensibilité',
    'monitor.scenario': 'Scénario de Surveillance',
    'monitor.pet': 'Surveillance Animaux',
    'monitor.baby': 'Surveillance Bébé',
    'monitor.elderly': 'Soins aux Personnes Âgées',
    'alerts.title': 'Alertes',
    'alerts.noAlerts': 'Aucune alerte',
    'alerts.acknowledge': 'Acquitter',
    'alerts.severity.critical': 'Critique',
    'alerts.severity.high': 'Élevé',
    'alerts.severity.medium': 'Moyen',
    'alerts.severity.low': 'Faible',
    'alerts.severity.info': 'Info',
    'settings.title': 'Paramètres',
    'settings.profile': 'Informations du Profil',
    'settings.displayName': "Nom d'Affichage",
    'settings.preferences': 'Préférences',
    'settings.notifications': 'Paramètres de Notification',
    'settings.motionSensitivity': 'Sensibilité au Mouvement',
    'settings.audioSensitivity': 'Sensibilité Audio',
    'settings.theme': 'Thème',
    'settings.language': 'Langue',
    'auth.welcome': 'Bienvenue sur SafeOS Guardian',
    'auth.guestMode': 'Continuer en tant qu\'Invité',
    'auth.email': 'Adresse Email',
    'auth.password': 'Mot de Passe',
    'auth.confirmPassword': 'Confirmer le Mot de Passe',
    'auth.forgotPassword': 'Mot de Passe Oublié?',
    'auth.noAccount': "Vous n'avez pas de compte?",
    'auth.hasAccount': 'Vous avez déjà un compte?',
    'onboarding.welcome': 'Bienvenue sur SafeOS Guardian',
    'onboarding.disclaimer': 'AVIS IMPORTANT',
    'onboarding.disclaimerText': 'SafeOS Guardian est UNIQUEMENT un outil de surveillance supplémentaire. Il ne doit jamais remplacer les soins humains directs, la surveillance médicale professionnelle ou la supervision parentale.',
    'onboarding.understand': 'Je Comprends et Accepte',
    'onboarding.selectScenario': 'Choisissez Votre Scénario de Surveillance',
    'onboarding.grantPermissions': 'Autoriser l\'Accès à la Caméra et au Microphone',
    'onboarding.complete': 'Configuration Terminée',
    'error.generic': 'Quelque chose a mal tourné',
    'error.network': 'Erreur réseau. Vérifiez votre connexion.',
    'error.unauthorized': 'Veuillez vous connecter pour continuer',
    'error.notFound': 'Page non trouvée',
    'error.camera': 'Accès à la caméra refusé',
    'error.microphone': 'Accès au microphone refusé',
    'footer.disclaimer': 'Ne remplace pas les soins directs',
    'footer.humanitarian': 'Travail humanitaire',
  },

  de: {
    'common.loading': 'Laden...',
    'common.error': 'Ein Fehler ist aufgetreten',
    'common.save': 'Speichern',
    'common.cancel': 'Abbrechen',
    'common.delete': 'Löschen',
    'common.edit': 'Bearbeiten',
    'common.confirm': 'Bestätigen',
    'common.back': 'Zurück',
    'common.next': 'Weiter',
    'common.skip': 'Überspringen',
    'common.continue': 'Fortfahren',
    'common.close': 'Schließen',
    'common.search': 'Suchen',
    'common.settings': 'Einstellungen',
    'common.help': 'Hilfe',
    'common.logout': 'Abmelden',
    'common.login': 'Anmelden',
    'common.signup': 'Registrieren',
    'nav.home': 'Startseite',
    'nav.monitor': 'Monitor',
    'nav.history': 'Verlauf',
    'nav.settings': 'Einstellungen',
    'nav.profiles': 'Profile',
    'nav.analytics': 'Analysen',
    'nav.admin': 'Admin',
    'nav.help': 'Hilfe',
    'dashboard.title': 'SafeOS Guardian',
    'dashboard.subtitle': 'Humanitäre KI-Überwachung',
    'dashboard.systemStatus': 'Systemstatus',
    'dashboard.quickActions': 'Schnellaktionen',
    'dashboard.activeStreams': 'Aktive Streams',
    'dashboard.noStreams': 'Keine aktiven Streams',
    'dashboard.startMonitoring': 'Überwachung Starten',
    'dashboard.viewAlerts': 'Warnungen Anzeigen',
    'monitor.title': 'Live-Überwachung',
    'monitor.startStream': 'Stream Starten',
    'monitor.stopStream': 'Stream Stoppen',
    'monitor.motionDetected': 'Bewegung Erkannt',
    'monitor.audioDetected': 'Audio Erkannt',
    'monitor.sensitivity': 'Empfindlichkeit',
    'monitor.scenario': 'Überwachungsszenario',
    'monitor.pet': 'Haustierüberwachung',
    'monitor.baby': 'Babyüberwachung',
    'monitor.elderly': 'Seniorenbetreuung',
    'alerts.title': 'Warnungen',
    'alerts.noAlerts': 'Keine Warnungen',
    'alerts.acknowledge': 'Bestätigen',
    'alerts.severity.critical': 'Kritisch',
    'alerts.severity.high': 'Hoch',
    'alerts.severity.medium': 'Mittel',
    'alerts.severity.low': 'Niedrig',
    'alerts.severity.info': 'Info',
    'settings.title': 'Einstellungen',
    'settings.profile': 'Profilinformationen',
    'settings.displayName': 'Anzeigename',
    'settings.preferences': 'Präferenzen',
    'settings.notifications': 'Benachrichtigungseinstellungen',
    'settings.motionSensitivity': 'Bewegungsempfindlichkeit',
    'settings.audioSensitivity': 'Audioempfindlichkeit',
    'settings.theme': 'Thema',
    'settings.language': 'Sprache',
    'auth.welcome': 'Willkommen bei SafeOS Guardian',
    'auth.guestMode': 'Als Gast Fortfahren',
    'auth.email': 'E-Mail-Adresse',
    'auth.password': 'Passwort',
    'auth.confirmPassword': 'Passwort Bestätigen',
    'auth.forgotPassword': 'Passwort Vergessen?',
    'auth.noAccount': 'Noch kein Konto?',
    'auth.hasAccount': 'Bereits ein Konto?',
    'onboarding.welcome': 'Willkommen bei SafeOS Guardian',
    'onboarding.disclaimer': 'WICHTIGER HINWEIS',
    'onboarding.disclaimerText': 'SafeOS Guardian ist NUR ein ergänzendes Überwachungstool. Es sollte niemals die direkte menschliche Betreuung, professionelle medizinische Überwachung oder elterliche Aufsicht ersetzen.',
    'onboarding.understand': 'Ich Verstehe und Akzeptiere',
    'onboarding.selectScenario': 'Wählen Sie Ihr Überwachungsszenario',
    'onboarding.grantPermissions': 'Kamera- und Mikrofonzugang Gewähren',
    'onboarding.complete': 'Einrichtung Abgeschlossen',
    'error.generic': 'Etwas ist schief gelaufen',
    'error.network': 'Netzwerkfehler. Überprüfen Sie Ihre Verbindung.',
    'error.unauthorized': 'Bitte melden Sie sich an, um fortzufahren',
    'error.notFound': 'Seite nicht gefunden',
    'error.camera': 'Kamerazugang verweigert',
    'error.microphone': 'Mikrofonzugang verweigert',
    'footer.disclaimer': 'Kein Ersatz für direkte Betreuung',
    'footer.humanitarian': 'Humanitäre Arbeit',
  },

  // Stub entries for other languages (will be filled with English fallbacks below)
  zh: {} as Record<string, string>,
  ja: {} as Record<string, string>,
  pt: {} as Record<string, string>,
  ar: {} as Record<string, string>,
  hi: {} as Record<string, string>,
  ko: {} as Record<string, string>,
};

// Export translations and derive TranslationKey type
export const translations = translationsData;
export type TranslationKey = keyof typeof translationsData.en;

// Fill in missing keys for other languages with English fallbacks
const languages: Locale[] = ['zh', 'ja', 'pt', 'ar', 'hi', 'ko'];
languages.forEach((lang) => {
  translations[lang] = { ...translations.en };
});

// =============================================================================
// Store
// =============================================================================

export const useI18nStore = create<I18nStore>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'safeos-i18n',
    }
  )
);

// =============================================================================
// Hook
// =============================================================================

export function useTranslation() {
  const { locale, setLocale } = useI18nStore();

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    let text = translations[locale]?.[key] || translations.en[key] || key;

    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{{${k}}}`, String(v));
      });
    }

    return text;
  };

  return { t, locale, setLocale };
}

// =============================================================================
// Language Names
// =============================================================================

export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  zh: '中文',
  ja: '日本語',
  pt: 'Português',
  ar: 'العربية',
  hi: 'हिन्दी',
  ko: '한국어',
};

export default useTranslation;


