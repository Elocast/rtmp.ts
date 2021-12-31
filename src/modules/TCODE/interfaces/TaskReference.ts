interface TaskReference {
  name: string;
  source: string;
  output_path: string;
  params: {
    pre: any[];
    mid: any[];
    out: any[];
  }
}

export default TaskReference;
