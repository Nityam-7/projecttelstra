import dotenv from "dotenv";
dotenv.config();
import { PrismaClient } from "@prisma/client";
// const {PrismaClient} = require("@prisma/client")
const prisma = new PrismaClient();
import swaggerUi from "swagger-ui-express";
import swaggerSpec from './swaggerConfig.js'; 
import express from "express";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
//import express from 'express';
import cors from 'cors';

// const app = express();



// Your other middleware and route definitions


import {
  Customer,
  Invoice,
  Plan,
  PostpaidPlan,
  PrepaidPlan,
} from "../telecom-billing-system.js";
import { LinkedList } from "../LinkedList.js";
const app = express();
app.use(express.json());
// Use CORS middleware
app.use(cors());
const PORT = 9099;
const SECRET_KEY = process.env.JWT_SECRET;
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(bodyParser.json());

let customers = {};

const dummyCustomers = [
  {
    id: "customer1",
    name: "Jim",
    email: "Jim@example.com",
    password: bcrypt.hashSync("password123", 8),
  },
  {
    id: "customer2",
    name: "Dwight",
    email: "Dwight@example.com",
    password: bcrypt.hashSync("password456", 8),
  },
];
const custIds = dummyCustomers.forEach((customer) => {
  customers[customer.id] = {
    ...customer,
    invoices: [],
  };
});

function verifyToken(req, res, next) {
  const token = req.headers['x-access-token'];
  if (!token) {
    return res.status(403).send('No token provided.');
  }

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(500).send('Failed to authenticate token.');
    }
    req.customerId = decoded.id;
    next();
  });
}


/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new customer
 *     tags: 
 *       - Customers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *               phone:
 *                 type: string
 *                 example: 1234567890
 *     responses:
 *       201:
 *         description: Customer registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 auth:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: All fields are required
 *       500:
 *         description: There was a problem registering the user
 */
app.post('/register', async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password || !phone) {
    return res.status(400).send('All fields are required.');
  }

  const hashedPassword = bcrypt.hashSync(password, 8);

  try {
    let newCustomer = new Customer(name, email, phone, password);
    newCustomer = await prisma.customer.create({
      data: {
        customerId: newCustomer.customerId,
        customerCurrPlan: 0,
        customerName: name,
        customerMail: email,
        customerPhone: phone,
        password: hashedPassword,
      },
    });

    const token = jwt.sign({ id: newCustomer.customerId }, SECRET_KEY, {
      expiresIn: 86400, // 24 hours
    });

    res.status(201).send({ auth: true, token });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send('There was a problem registering the user.');
  }
});


let loggedInCustomers = [];

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Log in a customer
 *     tags: 
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Customer logged in successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 auth:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Email and password are required
 *       401:
 *         description: Invalid password
 *       404:
 *         description: No user found
 *       500:
 *         description: There was a problem logging in
 */
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send('Email and password are required.');
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { customerMail: email },
    });

    if (!customer) {
      return res.status(404).send('No user found.');
    }

    const passwordIsValid = bcrypt.compareSync(password, customer.password);

    if (!passwordIsValid) {
      return res.status(401).send({ auth: false, token: null });
    }

    const token = jwt.sign({ id: customer.customerId }, SECRET_KEY, {
      expiresIn: 86400, // 24 hours
    });

    loggedInCustomers.push(customer.customerId);

    console.log(loggedInCustomers[0]);
    res.status(200).send({ auth: true, token });
  } catch (error) {
    res.status(500).send('There was a problem logging in.');
  }
});



// app.get('/viewInvoice',(req,res)=>{
//     const customerId = req.body
//     res.send({

//     })
// })

app.post("/generateInvoice", async (req, res) => {
  const { customerMail } = req.body;

  try {
    const customer = await prisma.customer.findUnique({
      where: { customerMail },
    });
    const planId = customer.customerCurrPlan;
    console.log(planId);
    const plan = await prisma.plan.findUnique({
      where: { planId },
      include: {
        prepaidPlans: true,
        postpaidPlans: true,
      },
    });

    if (!customer) {
      return res.status(404).send("Customer not found.");
    }

    if (!planId) {
      return res.status(400).send("Plan ID is required.");
    }

    let planType;
    let createdInvoice;
    if (plan.prepaidPlans.length > 0) {
      planType = "PREPAID";
      const date = new Date();
      const invoice = new Invoice(
        customer.customerName,
        customer.customerId,
        plan,
        plan.prepaidPlans[0].unitsAvailable,
        date,
        planType,
        plan.prepaidPlans[0].prepaidBalance
      );
      createdInvoice = await prisma.invoice.create({
        data: {
          invoiceId: invoice.invoiceId,
          customerName: customer.customerName,
          customerId:customer.customerId,
          planId: plan.planId,
          units: plan.prepaidPlans[0].unitsAvailable,
          date,
          amount: plan.prepaidPlans[0].prepaidBalance,
          planType,
        },
      });
    } else if (plan.postpaidPlans.length > 0) {
      planType = "POSTPAID";
      const date = new Date();
      const invoice = new Invoice(
        customer.customerName,
        customer.customerId,
        plan,
        plan.postpaidPlans[0].unitsUsed,
        date,
        planType,
        plan.postpaidPlans[0].unitsUsed * plan.ratePerUnit
      );
      createdInvoice = await prisma.invoice.create({
        data: {
          invoiceId: invoice.invoiceId,
          customerName: customer.customerName,
          customerId:customer.customerId,
          planId: plan.planId,
          units: plan.postpaidPlans[0].unitsUsed,
          date,
          amount: plan.postpaidPlans[0].unitsUsed * plan.ratePerUnit,
          planType,
        },
      });
    } else {
      return res.status(400).send("Invalid plan type.");
    }

    // const date = new Date();
    // const invoice = new Invoice(customer.customerName, customer.customerId, plan, units, date, planType, amount);
    // const createdInvoice = await prisma.invoice.create({
    //   data: {
    //     invoiceId:invoice.invoiceId,
    //     customerName: customer.customerName,
    //     customerId,
    //     planId: plan.planId,
    //     units,
    //     date,
    //     amount,
    //     planType
    //   },
    // });

    res.send({
      message: "Invoice generated successfully.",
      invoice: createdInvoice,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error.");
  }
});

app.post("/buyPlan", async (req, res) => {
  const { customerMail, planName, planType } = req.body;

  let plan, planInstance;
  try {
    // Fetch the customer from the database
    const customer = await prisma.customer.findUnique({
      where: { customerMail: customerMail},
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    if (planType === "PREPAID") {
      // Fetch the plan from the database
      plan = await prisma.plan.findFirst({
        where: { planName: planName },
        include: {
          prepaidPlans: true,
          postpaidPlans: false,
        },
      });

      if (plan && plan.prepaidPlans.length > 0) {
        planInstance = new PrepaidPlan(
          plan.planName,
          plan.ratePerUnit,
          plan.prepaidPlans[0].prepaidBalance,
          plan.prepaidPlans[0].unitsAvailable
        );
      }
    } else if (planType === "POSTPAID") {
      // Fetch the plan from the database
      console.log("ASDASDASD");
      plan = await prisma.plan.findFirst({
        where: { planName: planName },
        include: {
          prepaidPlans: false,
          postpaidPlans: true,
        },
      });

      if (plan && plan.postpaidPlans.length > 0) {
        planInstance = new PostpaidPlan(
          plan.planName,
          plan.ratePerUnit,
          plan.postpaidPlans[0].billingCycle,
          plan.postpaidPlans[0].unitsUsed
        );
      }
    }
    // console.log(planInstance.planName)
    // console.log(JSON.stringify(planInstance))
    if (!plan || !planInstance) {
      return res.status(404).json({ error: "Plan not found" });
    }

    const now = new Date();
    let invoice = new Invoice(
      customer.customerName,
      customer.customerId,
      planInstance,
      0,
      now.toDateString(),
      planType
    );

    if (planType === "PREPAID") {
      invoice.units = planInstance.unitsAvailable;
      console.log(planInstance.prepaidBalance);
      // payment gateway integration to get prepaid balance
      invoice = await prisma.invoice.create({
        data: {
          invoiceId: invoice.invoiceId,
          customerName: customer.customerName,
          customerId: customer.customerId,
          planId: plan.planId,
          units: invoice.units,
          date: now,
          amount: planInstance.prepaidBalance,
          planType: planType,
        },
      });
    } else if (planType === "POSTPAID") {
      invoice.units = planInstance.unitsUsed;

      invoice = await prisma.invoice.create({
        data: {
          invoiceId: invoice.invoiceId,
          customerName: customer.customerName,
          customerId: customer.customerId,
          planId: plan.planId,
          units: invoice.units,
          date: now,
          amount: 0,
          planType: planType,
        },
      });
    }

    await prisma.customer.update({
      where: { customerMail: customerMail },
      data: { customerCurrPlan: plan.planId, customerType: plan.planType }, // Assuming 'plan.planId' is the unique identifier for the plan
    });

    res.status(201).json({ customer, plan, invoice });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/admin/addPlan", async (req, res) => {
  const { planName, ratePerUnit, planType, prepaidBalance, billingCycle } = req.body;
  const availablePlans = [
    { planName: "Airtel 199 Prepaid", ratePerUnit
      : 1.5, planType: "PREPAID", prepaidBalance: 199 },
    { planName: "Airtel 399 Prepaid", ratePerUnit: 1.2, planType: "PREPAID", prepaidBalance: 399 },
    { planName: "Airtel 599 Prepaid", ratePerUnit: 1.0, planType: "PREPAID", prepaidBalance: 599 }, 
    { planName: "Airtel 799 Prepaid", ratePerUnit: 0.9, planType: "PREPAID", prepaidBalance: 799 }, 
    { planName: "Airtel 499 Postpaid", ratePerUnit: 2.0, planType: "POSTPAID", billingCycle: 30 },
    { planName: "Airtel 999 Postpaid", ratePerUnit: 1.8, planType: "POSTPAID", billingCycle: 30 },
    { planName: "Airtel 1299 Postpaid", ratePerUnit: 1.5, planType: "POSTPAID", billingCycle: 30 }, 
    { planName: "Airtel 1599 Postpaid", ratePerUnit: 1.2, planType: "POSTPAID", billingCycle: 30 } 
  ];

  // Check if the plan is among the predefined plans
  const selectedPlan = availablePlans.find(plan => plan.planName === planName && plan.planType === planType);

  if (!selectedPlan) {
    return res.status(400).json({ error: "Invalid plan type or plan name. Please select a valid plan." });
  }

  let plan = new Plan(planName,ratePerUnit,planType)
  // Create the base plan record
  plan = await prisma.plan.create({
    data: {
      planId: plan.planId,
      planName: selectedPlan.planName,
      ratePerUnit: selectedPlan.ratePerUnit
    },
  });

  // Create the specific type of plan (prepaid or postpaid)
  if (selectedPlan.planType === "PREPAID") {
    const prepaidPlan = await prisma.prepaidPlan.create({
      data: {
        planId: plan.planId,
        unitsAvailable: selectedPlan.prepaidBalance / selectedPlan.ratePerUnit,
        prepaidBalance: selectedPlan.prepaidBalance
      },
    });
    return res.status(201).json({ plan, prepaidPlan });

  } else if (selectedPlan.planType === "POSTPAID") {
    const postpaidPlan = await prisma.postpaidPlan.create({
      data: {
        planId: plan.planId,
        unitsUsed: 0,
        billingCycle: selectedPlan.billingCycle
      },
    });
    return res.status(201).json({ plan, postpaidPlan });
  }
});


app.post("/admin/addCustomer", async (req, res) => {
  const { customerName, customerMail, customerPhone } = req.body;
  let cust = new Customer(customerName, customerMail, customerPhone);
  // let cl_head = cl.insertCustomer(req.body)
  console.log(JSON.stringify(cust, null, 2));
  // let i = new Invoice(123,cl_head.obj.customerId)

  // const invoicesData = invoiceList.map(invoiceId=>({
  //     invoiceId: invoiceId,
  //     customerId: cl_head.obj.customerId
  // }))
  let dataobj = {
    data: {
      customerId: cust.customerId,
      customerName: customerName,
      customerCurrPlan: 0,
      customerMail: customerMail,
      customerPhone: customerPhone,
      password:"admin"
      // invoiceList:{
      //     create: invoicesData
      // }
    },
  };
  await prisma.customer.create(dataobj);
  // res.send({
  //   id: cust.customerId,
  //   name: cust.customerName,
  //   plan: 0,
  //   mail: cust.customerMail,
  //   phone: cust.customerPhone,
  //   // invoiceList : cl_head.obj.invoiceList
  // });
  res.status(201).json({cust})
  console.log(cust.customerName);
  // cl.printToEnd(cl_head)
  // cl.printToEnd(cl_head)
});


// src/index.js or your backend file
app.get("/invoices", async (req, res) => {
  const { customerMail } = req.query; // Use req.query to get query parameters

  if (!customerMail) {
    return res.status(400).json({ error: 'Customer email is required' });
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { customerMail }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const invoices = await prisma.invoice.findMany({
      where: { customerId: customer.customerId }
    });

    res.json(invoices);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching invoices' });
  }
});


app.get("/invoices/:invoiceId", async (req, res) => {
  let {invoiceId} = req.params
  invoiceId = parseInt(invoiceId,10)
  // const {customerMail} = req.body
  let invoice_res = await prisma.invoice.findUnique({
    where:{invoiceId:invoiceId}
  })
  res.send(invoice_res)
});

app.post("/payInvoice", verifyToken, (req, res) => {
  const { invoiceId } = req.body;
  const customerId = req.customerId;

  if (!customers[customerId]) {
    return res.status(404).send("Customer not found.");
  }

  const invoice = customers[customerId].invoices.find(
    (inv) => inv.invoiceId === invoiceId
  );

  if (!invoice) {
    return res.status(404).send("Invoice not found.");
  }

  if (invoice.paid) {
    return res.status(400).send("Invoice is already paid.");
  }

  invoice.paid = true;
  res.send({
    message: `Invoice ${invoiceId} for customer ${customerId} has been paid.`,
    invoice,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
