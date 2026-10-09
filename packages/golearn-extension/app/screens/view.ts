/** What the shell hands a screen besides its element: whether this render is still the current one, and cleanup. */
export interface View {
  /** False once the learner has moved to another screen (or the app was destroyed): stop touching the DOM. */
  alive(): boolean;
  /** Register cleanup to run when the learner leaves this screen. */
  onDispose(fn: () => void): void;
}
