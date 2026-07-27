import unittest
from parser import parse_python_file, parse_js_ts_file, classify_module

class TestParser(unittest.TestCase):
    
    def test_parse_python_functions_and_imports(self):
        code = """
import os
from collections import defaultdict

class MyClass:
    def my_method(self, arg1, arg2):
        if arg1:
            for i in range(arg2):
                pass
        return True
        
def simple_func():
    pass
"""
        result = parse_python_file(code, "test.py")
        self.assertEqual(len(result['imports']), 2)
        self.assertEqual(result['imports'][0]['module'], 'os')
        self.assertEqual(result['imports'][1]['module'], 'collections')
        
        self.assertEqual(len(result['functions']), 2)
        
        func1 = next(f for f in result['functions'] if f['name'] == 'my_method')
        self.assertEqual(func1['class_name'], 'MyClass')
        self.assertEqual(func1['parameters'], ['self', 'arg1', 'arg2'])
        self.assertTrue(func1['complexity_score'] > 1.0)
        
        func2 = next(f for f in result['functions'] if f['name'] == 'simple_func')
        self.assertEqual(func2['class_name'], None)
        self.assertEqual(func2['complexity_score'], 1.0)

    def test_parse_js_ts_functions(self):
        code = """
import { something } from 'some-module';
const myFunc = async (req, res) => {
    if (req.body) {
        return res.json(req.body);
    }
}

export function testFn() {
    console.log("hello");
}
"""
        result = parse_js_ts_file(code)
        self.assertEqual(len(result['imports']), 1)
        self.assertEqual(result['imports'][0]['module'], 'some-module')
        
        self.assertEqual(len(result['functions']), 2)
        
        func1 = next(f for f in result['functions'] if f['name'] == 'myFunc')
        self.assertTrue(func1['complexity_score'] >= 2.0)
        
        func2 = next(f for f in result['functions'] if f['name'] == 'testFn')
        self.assertEqual(func2['complexity_score'], 1.0)

    def test_classify_module(self):
        self.assertEqual(classify_module("src/main.py", ""), "entry_point")
        self.assertEqual(classify_module("src/routes/auth.ts", ""), "api_layer")
        self.assertEqual(classify_module("src/services/payment.js", ""), "business_logic")
        self.assertEqual(classify_module("src/models/user.py", ""), "data_layer")
        self.assertEqual(classify_module("src/utils/math.py", ""), "utility")

if __name__ == '__main__':
    unittest.main()
