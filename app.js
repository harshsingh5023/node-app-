const express = require('express');
const app =  express();
const mongoose = require('mongoose');
const userModel = require('./models/user_model');
const UserSchema = require('./user_schema');
const bcrypt = require('bcrypt');
const validator = require('validator');
const session = require('express-session');
const mongoDBSession = require('connect-mongodb-session')(session);
const jwt = require("jsonwebtoken");
var fs = require('fs-extra');
var multer = require('multer');
var imgModel = require('./models/image');
var path = require('path');
require('dotenv/config');


const {cleanUpAndValidate,jwtSign,sendVerifcationEmail,send_forget_mail} = require('./utils/auth_util');

const isAuth = require("./middleware/isAuth");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(express.static("public"));
app.set("view engine", "ejs");

mongoose.set("strictQuery", false);
const mongoURI = "mongodb+srv://harshtomar5023:Agra1234@cluster0.audbpoy.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(mongoURI,{
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then((res) => {
    console.log("Connected to DB");
  }).catch((err) => {
    console.error(err);
  })


  var storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads')
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now())
    }
});
var upload = multer({ storage: storage });
const store = new mongoDBSession({
    uri: mongoURI,
    collection: "sessions"
})

app.use(
    session({
        secret: "hiiii",
        resave: false,
        saveUninitialized: false,
        store: store
    })
);



  app.get('/', (req,res) => {
    res.render('homepage')
});
app.get('/profile', isAuth, (req,res) => {
    res.render('profile_user')
});
app.get('/registration', (req,res) => {
    res.render('registration_user')
})
app.get('/login', (req,res) => {
    res.render("login_user");
})

app.post('/registration', async (req,res) => {
    const { name, email, username, password, phone } = req.body;
    try{
        await cleanUpAndValidate({name, email, username, password, phone});
    } catch(err) {
        return res.send({
            status: 400,
            message: 'hi',
        });
    };
    const hashedpass = await bcrypt.hash(password,7);
    let user = new UserSchema({
        name: name,
        username: username,
        password: hashedpass,
        email: email,
        emailAuthenticated: false,
        phone: phone,
        state: '',
        country: '',
        college: '',
        profile: {},
    })

    let userExists;
    try{
        userExists = await UserSchema.findOne({email});
    } catch(err){
        res.send({
            status: 400,
            message: "Internal server error",
            error: err
        })
    }
    if(userExists){
        return res.send({
            status: 400,
            message: "User already exists"
        })
    }
    const verificationToken = jwtSign(email);

    try{
        const userDB = await user.save();
        sendVerifcationEmail(email, verificationToken);
        return res.send({
            status: 200,
            message:
              "Verification has been sent to your mail Id. Please verify before login",
            data: {
              _id: userDB._id,
              username: userDB.username,
              email: userDB.email,
            },
          });
        
        // res.redirect('/login')
    } catch(err){
        return res.send({
            status: 400,
            message: "Internal server error",
            error: err
        })
    }
});

app.get("/verifyEmail/:id", (req, res) => {
    const token = req.params.id;
    jwt.verify(token, "this is me", async (err, verifiedJwt) => {
      if (err) res.send("hi");
  
  
      const userDb = await UserSchema.findOneAndUpdate(
        { email: verifiedJwt.email },
        { emailAuthenticated: true }
      );
      if (userDb) {
        return res.status(200).redirect("/login");
      } else {
        return res.send({
          status: 400,
          message: "Invalid Session link",
        });
      }
    });
    return res.status(200);
  });

app.post('/forget_password', async (req, res) => {
    const {loginId} = req.body;
    if( typeof(loginId) !== "string" || !loginId ){
        return res.send({
            status: 400,
            message: "Invalid Data"
        })
    }
    let userDB;
    
    try{
        if( validator.isEmail(loginId) ){
            userDB = await UserSchema.findOne({email: loginId});
        }else{
            userDB = await UserSchema.findOne({username: loginId});
        }
        if(!userDB){
            res.send({
                status: 400,
                message: "User not found, please rgister again",
                error: err
            })
        }

        if (userDB.emailAuthenticated === false) {
            return res.send({
              status: 400,
              message: "Please verifiy your mailid",
            });
          }
          const verificationToken = jwtSign(userDB.email);

          send_forget_mail(userDB.email, verificationToken);

        res.send({
            status: 200,
            message: "Mail sent successfully"
        })
    }catch(err){
        return res.send({
            status: 400,
            message: "Internal Server Error, Please try again!",
            error: err
        })
    }
})
app.get('/forgetPassword/:id', async (req, res) => {
    const token = req.params.id;
    jwt.verify(token, "hiiii", async (err, verifiedJwt) => {
      if (err) res.send(err);
  
  
      const userDb = await UserSchema.findOne(
        { email: verifiedJwt.email });
      if (userDb) {
        return res.redirect(`/forgetpass/${userDb.email}`)
      } else {
        return res.send({
          status: 400,
          message: "Invalid Session link",
        });
      }
    });
    return res.status(200);
})
app.post('/login', async (req, res) => {
    const {loginId, password} = req.body;

    if( typeof loginId !== 'string' || typeof password !== 'string' || !loginId || !password ){
        return res.send({
            status: 400,
            message: "Invalid Data"
        })
    }
    let userDB;

    try{
        if( validator.isEmail(loginId) ){
            userDB = await UserSchema.findOne({email: loginId});
        }else{
            userDB = await UserSchema.findOne({username: loginId});
        }
        if(!userDB){
            res.send({
                status: 400,
                message: "User not found, please rgister again",
                error: err
            })
        }

        if (userDB.emailAuthenticated === false) {
            return res.send({
              status: 400,
              message: "Please verifiy your mailid",
            });
          }

        const isMatch = await bcrypt.compare(password, userDB.password);
        if (!isMatch) {
            return res.send({
                status: 400,
                message: "Password not correct",
                data: req.body
            })
        }

        req.session.isAuth = true;
        req.session.user = {
            username: userDB.username,
            email: userDB.email,
            userId: userDB._id,
            name: userDB.name,
            college: '',
            state: '',
            country: '',
            phone: userDB.phone,
            profile: userDB.profile,
        }
        res.redirect('/profile');
    }catch(err){
        return res.send({
            status: 400,
            message: "Internal Server Error, Please try again!",
            error: err
        })
    }

})
app.get('/forgetpass/:id', (req, res) => {
    var email = req.params.id;
    return res.render('forgetpass',{email: email})
})
app.post('/update_password', async (req, res) => {
       const {email,password} = req.body;
        try{
            var userDb = await UserSchema.find({email: email})
         if(userDb){
             const hashedpass = await bcrypt.hash(password,7);
             const  temp = await UserSchema.findOneAndUpdate({email: email},{password: hashedpass});
             return res.send({
                 status: 200,
                 message: "Password updated successfully"
             });
         }else{
             return res.send({
                 status: 400,
                 message: "internal server error"
             })
         }
        } catch(err) {
            return res.send({
                status: 400,
                error: err
            })
        }
})
app.post('/resend_verification_mail', async (req, res) => {
    const {email} = req.body;
    const verificationToken = jwtSign(email);
  let userExists;
  try{
      userExists = await UserSchema.findOne({email});
      if(userExists.emailAuthenticated){
        return res.send({
            status: 400,
            message: "User already verified"
        })
      }
  } catch(err){
      return res.send({
          status: 400,
          message: "User does not exist",
          error: err
      })
  }
    try{
        sendVerifcationEmail(email, verificationToken);
        return res.send({
            status: 200,
            message:
              "Verification has been sent to your mail Id. Please verify before login",
            data: {
              _id: userDB._id,
              username: userDB.username,
              email: userDB.email,
            },
          });
    } catch(err){
        return res.send({
            status: 400,
            message: "Internal server error",
            error: err
        })
    }
})
app.post("/logout", isAuth, (req, res) => {
    req.session.destroy((err) => {
      if (err) throw err;
  
      res.redirect("/login");
    });
  });
app.post('/fetch_data', async (req, res) => {
    const e = req.session.user.email;
    const {email, username, name, phone, state, country, college, profile} = await UserSchema.findOne({email: e});
    return res.send({
        status: 200,
        message: "Data fetched successfully",
        user: {email, username, name, phone, state, country, college, profile}
    })
})
app.post('/uploadpicture', upload.single('image'), (req, res, next) => {
 
    var obj = {
        name: req.body.name,
        desc: req.body.desc,
        img: {
            data: fs.readFileSync(path.join(__dirname+req.file.filename)),
            contentType: 'image/png'
        }
    }
    imgModel.create(obj, (err, item) => {
        if (err) {
            console.log(err);
        }
        else {
            // item.save();
            res.redirect('/');
        }
    });
});


const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
}); 