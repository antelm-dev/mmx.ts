/** Shape of the file-access bridge the preload exposes on `window.studio`. */
export interface StudioFileApi {
  /**
   * Prompt for a save location and write `json` there. Returns the chosen file
   * name, or null if the dialog was cancelled.
   */
  saveFile(suggestedName: string, json: string): Promise<string | null>;
  /**
   * Prompt for a `.json` file and read it. Returns its name + contents, or null
   * if cancelled.
   */
  openFile(): Promise<{ name: string; json: string } | null>;
}
