$(window).load(function(){

    var obj = {};

    $.each([$("#carousel"), $("#slideshow"), $("#listbox"), $("#vertical-multi")], function(idx, el) {
        obj[el.attr("id")] = { "cont": el, "testFrame": el.children(".testFrame"), "startPos": el.children(".testFrame").position() };
    });

    obj["carousel"].cont.roto({ snap: false });
    obj["slideshow"].cont.roto();
    obj["listbox"].cont.roto({ direction: "v" });
    obj["vertical-multi"].cont.roto({ direction: "v" });
    
    test("Position after roto call is same as before", function() {
        $.each(obj, function(idx, el) {
            equal(el.testFrame.position()["top"], el.startPos["top"], idx + " top");
            equal(el.testFrame.position()["left"], el.startPos["left"], idx + " left");
        });
    });

});
