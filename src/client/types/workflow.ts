/**
 * Состояния сценария выдачи заказа
 */
export type WorkflowState =
  | 'idle'
  | 'loading-order'
  | 'order-loaded'
  | 'editing-recipient'
  | 'ready-to-generate'
  | 'checking'
  | 'confirm-existing'
  | 'generating'
  | 'success'
  | 'error';

export interface WorkflowContext {
  state: WorkflowState;
  error?: string;
}
