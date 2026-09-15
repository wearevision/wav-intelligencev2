export const controlCopy = {
  title: 'Hoy',
  allClear: 'Nada requiere tu atención.',
  allClearHint: 'Ningún estudio tiene etapas vencidas ni por vencer esta semana.',
  attention: 'Requiere tu atención',
  studies: 'Estudios',
  noStudies: 'Aún no hay estudios.',
  createFirst: 'Crear el primero',
  blockersCount: (n: number) => (n === 1 ? '1 pendiente para cerrar' : `${n} pendientes para cerrar`),
  readyToClose: 'Listo para cerrar',
  finished: 'Completo',
  alert: {
    stage_overdue: (stage: string, days: number) =>
      `${stage} venció hace ${days} ${days === 1 ? 'día' : 'días'}`,
    stage_due_soon: (stage: string, days: number) =>
      days === 0 ? `${stage} vence hoy` : `${stage} vence en ${days} ${days === 1 ? 'día' : 'días'}`,
    no_fieldwork: () => 'Sin fecha de terreno: el estudio no tiene línea de tiempo',
  },
} as const
