import type { Request, Response } from "express";
import { identifyContact } from "../services/contact.service";

export const identify = async (req: Request, res: Response) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "Provide email or phoneNumber" });
  }

  const result = await identifyContact(email, phoneNumber);

  return res.status(200).json({ contact: result });
};
