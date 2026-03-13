// src/utils/constants.js
// Constantes centralizadas para evitar strings hardcodeados

/**
 * Estados del flujo de agendamiento
 * Usar estos valores en lugar de strings directos
 */
export const STEPS = {
  NEW: "NEW",
  ASK_CONFIRM: "ASK_CONFIRM",
  AWAIT_BUCKET: "AWAIT_BUCKET",
  AWAIT_NAME: "AWAIT_NAME",
  AWAIT_DATE: "AWAIT_DATE",
  AWAIT_SLOT_CHOICE: "AWAIT_SLOT_CHOICE",
  AWAIT_EMAIL: "AWAIT_EMAIL",
  AFTER_CONFIRM: "AFTER_CONFIRM"
};

/**
 * Tipos de interacción esperada (para flujoGuard)
 */
export const INTERACTION_KINDS = {
  WELCOME: "welcome",
  BUCKET: "bucket",
  DATE_PICK: "date_pick",
  SLOT_PICK: "slot_pick",
  AFTER_MENU: "after_menu"
};

/**
 * Prefijos de IDs interactivos
 */
export const ID_PREFIXES = {
  MENU: "MENU",
  CAT: "CAT",
  SERV: "SERV",
  FAQ: "FAQ",
  AGENDAR: "AGENDAR",
  WELCOME: "WELCOME",
  BUCKET: "BUCKET",
  DATE: "DATE",
  SLOT: "SLOT"
};

/**
 * Intents detectables
 */
export const INTENTS = {
  SALUDO: "SALUDO",
  AGENDA: "AGENDA",
  SI: "SI",
  NO: "NO",
  ACK: "ACK",
  OTRA_FECHA: "OTRA_FECHA",
  SALIR: "SALIR",
  DESCONOCIDO: "DESCONOCIDO"
};
