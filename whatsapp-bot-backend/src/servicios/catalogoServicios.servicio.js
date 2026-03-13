//Busca categorías/servicios y arma textos.

export function listarCategorias(serviciosJson) {
  const categorias = serviciosJson?.categorias ?? [];
  return categorias.map((c) => ({
    id: c.id,
    titulo: c.titulo,
    calendario_key: c.calendario_key
  }));
}

export function listarServiciosPorCategoria(serviciosJson, categoriaId) {
  const categorias = serviciosJson?.categorias ?? [];
  const cat = categorias.find((c) => c.id === categoriaId);
  if (!cat) return null;

  return {
    categoria: {
      id: cat.id,
      titulo: cat.titulo,
      calendario_key: cat.calendario_key
    },
    servicios: (cat.servicios ?? []).map((s) => ({
      id: s.id,
      nombre: s.nombre,
      duracion_min: s.duracion_min ?? null,
      agenda_key: s.agenda_key,
      calendario_key: cat.calendario_key
    }))
  };
}

export function obtenerDetalleServicio(serviciosJson, servicioId) {
  const categorias = serviciosJson?.categorias ?? [];
  for (const cat of categorias) {
    const s = (cat.servicios ?? []).find((x) => x.id === servicioId);
    if (s) {
      return {
        ...s,
        duracion_min: s.duracion_min ?? null,
        categoria: {
          id: cat.id,
          titulo: cat.titulo,
          calendario_key: cat.calendario_key
        }
      };
    }
  }
  return null;
}

export function textoDetalleServicio(det) {
  const dur = det.duracion_min ? `\n⏱️ Duración estimada: ${det.duracion_min} min` : "";
  return `*${det.nombre}*\n\n• Indicador: ${det.indicador}\n• Objetivo: ${det.objetivo}${dur}`;
}

