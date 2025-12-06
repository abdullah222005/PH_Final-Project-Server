const express = require('express');
const cors = require("cors");
const app = express();
require('dotenv').config();

const port = process.env.PORT || 3333;

//middleware
app.use(express.json());
app.use(cors());

app.get('/', (req, res)=>{
    res.send("Zap is Shifting..!!!");
})

app.listen(port, ()=>{
    console.log(`Server is running on port: ${port}`);
})