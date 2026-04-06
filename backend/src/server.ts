import express from "express";
import cors from "cors";
import { Router } from "express";
import test from "./routes/test.js";
const app = express();
app.use(express.json());

app.use(cors());
const PORT = 3009;


const router1 = Router();
app.use(router1);

router1.post("/query", test);



app.listen(PORT, function (err: any) {
  if (err) console.log(err);
  console.log("Server listening on PORT", PORT);
});
