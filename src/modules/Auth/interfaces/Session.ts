interface Session {
  connection: {
    path: string;
    args: string;
    sId: string;
  },
  timer: any; // timeout loop
}

export default Session;
