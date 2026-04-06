import type { Request, Response } from "express";
const test = (req: Request, res: Response) => {
  const query = req.body.query;
  console.log("Received query:", query);
  res.json({ message: "Query received successfully" });
};
export default test;
