//Construye el menú y textos (solo formateo + definición de botones).
// src/servicios/menuPrincipal.servicio.js

export function textoMenuPrincipal(nombreNegocio) {
  return `Hola 👋 Soy el asistente de *${nombreNegocio}*.\n¿Qué necesitas?`;
}

export function filasMenuPrincipal() {
  return [
    { id: "MENU|AGENDAR", title: "Agendar", description: "Reservar una hora" },
    { id: "MENU|SERVICIOS", title: "Servicios", description: "Ver tratamientos y detalles" },
    { id: "MENU|FAQ", title: "Preguntas frecuentes", description: "Dudas comunes" },
    { id: "MENU|CONTACTO", title: "Contacto", description: "Dirección, horarios y WhatsApp" },
    { id: "MENU|HUMANO", title: "Hablar con humano", description: "Derivación con el equipo" }
  ];
}

export function uiMenuPrincipal() {
  return {
    buttonText: "Ver opciones",
    sectionTitle: "Menú"
  };
}
