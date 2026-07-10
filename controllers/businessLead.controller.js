import BusinessLead from "../Models/BusinessLead.js";

export const createBusinessLead = async (req, res) => {
  try {
    const lead = await BusinessLead.create(req.body);

    return res.status(201).json({
      success: true,
      message: "Business lead submitted successfully.",
      lead,
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Unable to submit business lead.",
    });

  }
};

export const getBusinessLeads = async (req, res) => {
  try {

    const leads = await BusinessLead
      .find()
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      leads,
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

export const getBusinessLead = async (req, res) => {

  try {

    const lead = await BusinessLead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    res.json({
      success: true,
      lead,
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message,
    });

  }

};

export const updateBusinessLeadStatus = async (req, res) => {

  try {

    const lead = await BusinessLead.findByIdAndUpdate(
    req.params.id,
    {
        status:req.body.status
    },
    {
        new:true,
        runValidators:true
    }
);

if(!lead){
   return res.status(404).json({
      success:false,
      message:"Lead not found"
   });
}

    res.json({
      success: true,
      lead,
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message,
    });

  }

};