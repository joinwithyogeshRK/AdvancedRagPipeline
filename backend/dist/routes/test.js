const test = (req, res) => {
    const query = req.body.query;
    console.log("Received query:", query);
    res.json({ message: "Query received successfully" });
};
export default test;
//# sourceMappingURL=test.js.map