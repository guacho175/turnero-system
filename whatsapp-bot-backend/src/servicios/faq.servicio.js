export function listarPreguntas(faqJson) {
  const preguntas = faqJson?.preguntas ?? [];
  return preguntas.map((p) => ({ id: p.id, pregunta: p.pregunta }));
}

export function obtenerRespuesta(faqJson, preguntaId) {
  const preguntas = faqJson?.preguntas ?? [];
  return preguntas.find((p) => p.id === preguntaId) ?? null;
}
