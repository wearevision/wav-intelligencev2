// Puerta pública client-safe del feature: tipos, lógica pura, copy.
// Nada de acá toca el servidor, así que se puede importar desde cualquier lado
// y testear sin variables de entorno.
//
// Las consultas viven en ./server, que sí es solo-servidor.
export type { Study, StudyStage, StudyStatus, StudySummary, StudyTask, StudyStageFile } from './types'
export {
  blockersFor,
  canClose,
  currentStage,
  daysUntil,
  isClosed,
  isOverdue,
  overdueStages,
  progress,
} from './model'
export type { Blocker } from './model'
export { studiesCopy, dueLabel } from './copy'

// Los componentes NO se exportan desde acá: importan server actions, que tocan
// el entorno al cargarse. Se importan por su ruta, desde ./components/*.
