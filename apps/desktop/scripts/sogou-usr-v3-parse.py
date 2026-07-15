'''Usage: parse.py <input-bin-dict> <output-tsv>'''

import struct
import sys


class KeyItem(object):
    datatype_size = [4, 1, 1, 2, 1, 2, 2, 4, 4, 8, 4, 4, 4, 0, 0, 0]

    def __init__(self):
        self.dict_typedef = 0
        self.datatype = []
        self.attr_idx = 0
        self.key_data_idx = 0
        self.data_idx = 0
        self.v6 = 0


class HeaderItem(object):
    def __init__(self):
        self.offset = 0
        self.datasize = 0
        self.used_datasize = 0

    def parse(self, f):
        self.offset = ReadUint32(f)
        self.datasize = ReadUint32(f)
        self.used_datasize = ReadUint32(f)


class AttributeItem(object):
    def __init__(self):
        self.count = 0
        self.a2 = 0
        self.data_id = 0
        self.b2 = 0


class HashStore(object):
    def __init__(self):
        self.offset = 0
        self.count = 0

    def parse(self, f):
        self.offset = ReadUint32(f)
        self.count = ReadUint32(f)


class LString(object):
    def __init__(self):
        self.size = 0
        self.data = None
        self.string = None

    def __str__(self):
        if self.size == 0:
            return 'LString(empty)'
        else:
            return f'LString(size={self.size}, string="{self.string}")'

    def parse(self, f):
        self.size = ReadUint16(f)
        self.data = f.read(self.size)
        self.string = self.data.decode('utf-16')


class AttrWordData(object):
    def __init__(self):
        self.offset = 0
        self.freq = 0
        self.aflag = 0
        self.i8 = 0
        self.p1 = 0
        self.iE = 0

    def parse(self, f):
        self.offset = ReadUint32(f)
        self.freq = ReadUint16(f)
        self.aflag = ReadUint16(f)
        self.i8 = ReadUint32(f)
        self.p1 = ReadUint16(f)
        self.iE = ReadInt32(f)  # always zero
        _ = ReadInt32(f)  # next offset


''' Dict Structure
key -> attrId        attr_store[data]
        -> dataId  ds[data]
    -> keyDataId   ds[data]
    -> dataId      ds[data]
'''


class UserHeader(object):
    def __init__(self):
        self.p2 = 0
        self.p3 = 0

    def parse(self, f):
        uints = [ReadUint32(f) for _ in range(19)]
        self.p2 = uints[14]
        self.p3 = uints[15]


class BaseDict(object):
    datatype_hash_size = [0, 27, 414, 512, -1, -1, 512, 0]

    def __init__(self, corev3=True):
        self.attr = None
        self.key = None
        self.aint = None
        self.header_index = None
        self.header_attr = None
        self.datastore = None
        self.ds_base = None
        self.datatype_size = None
        self.attr_size = None
        self.base_hash_size = None
        self.key_hash_size = [0] * 10
        self.aflag = False
        if corev3:  # t_usrDictV3Core::t_usrDictV3Core
            self.key_hash_size[0] = 500

    def init(self):
        self.datatype_size = []
        self.base_hash_size = []
        self.attr_size = [0] * len(self.attr)
        for idx_key, key in enumerate(self.key):
            size = (key.dict_typedef >> 2) & 4
            masked_typedef = key.dict_typedef & 0xFFFFFF8F
            # hash item
            if self.key_hash_size[idx_key] > 0:
                self.base_hash_size.append(self.key_hash_size[idx_key])
            else:
                self.base_hash_size.append(BaseDict.datatype_hash_size[masked_typedef])
            # datatype size
            if key.attr_idx < 0:
                for i, datatype in enumerate(key.datatype):
                    if i > 0 or masked_typedef != 4:
                        size += KeyItem.datatype_size[datatype]
                if key.attr_idx == -1:
                    size += 4
                self.datatype_size.append(size)
            else:
                num_attr = self.attr[key.attr_idx].count
                # non-attr data size
                num_non_attr = len(key.datatype) - num_attr
                for i in range(num_non_attr):
                    if i > 0 or masked_typedef != 4:
                        size += KeyItem.datatype_size[key.datatype[i]]
                if key.dict_typedef & 0x60 > 0:
                    size += 4
                size += 4
                self.datatype_size.append(size)
                # attr data size
                attr_size = 0
                for i in range(num_non_attr, len(key.datatype)):
                    attr_size += KeyItem.datatype_size[key.datatype[i]]
                if (key.dict_typedef & 0x40) == 0:
                    attr_size += 4
                self.attr_size[key.attr_idx] = attr_size
                # ???
                if self.attr[key.attr_idx].b2 == 0:
                    self.aflag = True

    def GetHashStore(self, index_id, datatype):
        if index_id < 0 or datatype > 6 or index_id > len(self.header_index):
            assert False
        index_offset = self.header_index[index_id].offset
        assert index_offset >= 0
        size = self.base_hash_size[index_id]
        offset = index_offset - 8 * size
        assert offset >= 0
        return self.ds_base.subview(offset)

    def GetIndexStore(self, index_id):
        return self.ds_base.subview(self.header_index[index_id].offset)

    def GetAttriStore(self, attr_id):
        return self.ds_base.subview(self.header_attr[attr_id].offset)

    def GetAttriFromIndex(self, index_id, attr_id, offset):
        datatype_size = self.datatype_size[index_id]
        data_offset = offset + datatype_size * attr_id
        return self.GetIndexStore(index_id).subview(data_offset)

    def GetAttriFromAttri(self, key_id, offset):
        attr_id = self.key[key_id].attr_idx
        attri_store = self.GetAttriStore(attr_id).subview(offset)
        if attri_store.pos >= len(attri_store.buff):
            return None
        return attri_store

    def GetAllDataWithAttri(self, key_id):
        results = []
        key = self.key[key_id]
        hashstore_base = self.GetHashStore(key_id, key.dict_typedef & 0xFFFFFF8F)
        attr_header = self.header_attr[key.attr_idx]
        if attr_header.used_datasize == 0:
            num_attr = attr_header.data_size
        else:
            num_attr = attr_header.used_datasize
        num_hashstore = self.base_hash_size[key_id]
        print(f'base_hash_size: {num_hashstore} num_attr: {num_attr}')
        for idx_hashstore in range(num_hashstore):
            hashstore = HashStore()
            hashstore.parse(hashstore_base)
            print(f'hashstore [ offset: {hashstore.offset}, count: {hashstore.count} ]')
            for attr_id in range(hashstore.count):
                attr_base = self.GetAttriFromIndex(key_id, attr_id, hashstore.offset)
                offset = ReadUint32(attr_base.subview(self.datatype_size[key_id] - 4))
                # print(f'attr_id: {attr_id} offset: {offset}')
                for attr2_id in range(num_attr):
                    attr2_base = self.GetAttriFromAttri(key_id, offset)
                    if attr2_base is None:
                        print(f'attr2 out of range (offset: {offset})')
                        break
                    results.append((attr_base, attr2_base))
                    offset = ReadInt32(attr2_base.subview(self.attr_size[key.attr_idx] - 4))
                    # print(f'attr2_id: {attr2_id} new offset: {offset}')
                    if offset == -1:
                        break
        return results

    def GetDataStore(self, data_id):
        return self.ds_base.subview(self.datastore[data_id].offset)

    def GetData(self, data_id, offset):
        header = self.datastore[data_id]
        # assert offset <= header.datasize
        if header.used_datasize > 0:
            if not offset <= header.used_datasize:
                print(f'GetData overflow data_id: {data_id} offset: {offset} '
                      f'header [ used: {header.used_datasize} size: {header.datasize} ]')
        datastore = self.GetDataStore(data_id)
        return datastore.subview(offset)

    def GetPys(self, offset):
        data_id = self.key[0].key_data_idx
        return self.GetData(data_id, offset)

    def GetDataIdByAttriId(self, attr_id):
        return self.attr[attr_id].data_id


pinyin = ['a', 'ai', 'an', 'ang', 'ao', 'ba', 'bai', 'ban', 'bang', 'bao', 'bei', 'ben', 'beng', 'bi', 'bian', 'biao',
          'bie', 'bin', 'bing', 'bo', 'bu', 'ca', 'cai', 'can', 'cang', 'cao', 'ce', 'cen', 'ceng', 'cha', 'chai',
          'chan', 'chang', 'chao', 'che', 'chen', 'cheng', 'chi', 'chong', 'chou', 'chu', 'chua', 'chuai', 'chuan',
          'chuang', 'chui', 'chun', 'chuo', 'ci', 'cong', 'cou', 'cu', 'cuan', 'cui', 'cun', 'cuo', 'da', 'dai', 'dan',
          'dang', 'dao', 'de', 'dei', 'den', 'deng', 'di', 'dia', 'dian', 'diao', 'die', 'ding', 'diu', 'dong', 'dou',
          'du', 'duan', 'dui', 'dun', 'duo', 'e', 'ei', 'en', 'eng', 'er', 'fa', 'fan', 'fang', 'fei', 'fen', 'feng',
          'fiao', 'fo', 'fou', 'fu', 'ga', 'gai', 'gan', 'gang', 'gao', 'ge', 'gei', 'gen', 'geng', 'gong', 'gou', 'gu',
          'gua', 'guai', 'guan', 'guang', 'gui', 'gun', 'guo', 'ha', 'hai', 'han', 'hang', 'hao', 'he', 'hei', 'hen',
          'heng', 'hong', 'hou', 'hu', 'hua', 'huai', 'huan', 'huang', 'hui', 'hun', 'huo', 'ji', 'jia', 'jian',
          'jiang', 'jiao', 'jie', 'jin', 'jing', 'jiong', 'jiu', 'ju', 'juan', 'jue', 'jun', 'ka', 'kai', 'kan', 'kang',
          'kao', 'ke', 'kei', 'ken', 'keng', 'kong', 'kou', 'ku', 'kua', 'kuai', 'kuan', 'kuang', 'kui', 'kun', 'kuo',
          'la', 'lai', 'lan', 'lang', 'lao', 'le', 'lei', 'leng', 'li', 'lia', 'lian', 'liang', 'liao', 'lie', 'lin',
          'ling', 'liu', 'lo', 'long', 'lou', 'lu', 'luan', 'lve', 'lun', 'luo', 'lv', 'ma', 'mai', 'man', 'mang',
          'mao', 'me', 'mei', 'men', 'meng', 'mi', 'mian', 'miao', 'mie', 'min', 'ming', 'miu', 'mo', 'mou', 'mu', 'na',
          'nai', 'nan', 'nang', 'nao', 'ne', 'nei', 'nen', 'neng', 'ni', 'nian', 'niang', 'niao', 'nie', 'nin', 'ning',
          'niu', 'nong', 'nou', 'nu', 'nuan', 'nve', 'nun', 'nuo', 'nv', 'o', 'ou', 'pa', 'pai', 'pan', 'pang', 'pao',
          'pei', 'pen', 'peng', 'pi', 'pian', 'piao', 'pie', 'pin', 'ping', 'po', 'pou', 'pu', 'qi', 'qia', 'qian',
          'qiang', 'qiao', 'qie', 'qin', 'qing', 'qiong', 'qiu', 'qu', 'quan', 'que', 'qun', 'ran', 'rang', 'rao', 're',
          'ren', 'reng', 'ri', 'rong', 'rou', 'ru', 'rua', 'ruan', 'rui', 'run', 'ruo', 'sa', 'sai', 'san', 'sang',
          'sao', 'se', 'sen', 'seng', 'sha', 'shai', 'shan', 'shang', 'shao', 'she', 'shei', 'shen', 'sheng', 'shi',
          'shou', 'shu', 'shua', 'shuai', 'shuan', 'shuang', 'shui', 'shun', 'shuo', 'si', 'song', 'sou', 'su', 'suan',
          'sui', 'sun', 'suo', 'ta', 'tai', 'tan', 'tang', 'tao', 'te', 'ten', 'teng', 'ti', 'tian', 'tiao', 'tie',
          'ting', 'tong', 'tou', 'tu', 'tuan', 'tui', 'tun', 'tuo', 'wa', 'wai', 'wan', 'wang', 'wei', 'wen', 'weng',
          'wo', 'wu', 'xi', 'xia', 'xian', 'xiang', 'xiao', 'xie', 'xin', 'xing', 'xiong', 'xiu', 'xu', 'xuan', 'xue',
          'xun', 'ya', 'yan', 'yang', 'yao', 'ye', 'yi', 'yin', 'ying', 'yo', 'yong', 'you', 'yu', 'yuan', 'yue', 'yun',
          'za', 'zai', 'zan', 'zang', 'zao', 'ze', 'zei', 'zen', 'zeng', 'zha', 'zhai', 'zhan', 'zhang', 'zhao', 'zhe',
          'zhei', 'zhen', 'zheng', 'zhi', 'zhong', 'zhou', 'zhu', 'zhua', 'zhuai', 'zhuan', 'zhuang', 'zhui', 'zhun',
          'zhuo', 'zi', 'zong', 'zou', 'zu', 'zuan', 'zui', 'zun', 'zuo', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
          'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4',
          '5', '6', '7', '8', '9', '#']


def DecryptPinyin(py_dataview):
    py = py_dataview.subview()
    n = ReadUint16(py) // 2
    ps = ""
    for _ in range(n):
        p = ReadUint16(py)
        ps += pinyin[p] + "'"
    return ps[:-1]


def DecryptWordsEx(lstr_dataview, p1, p2, p3):
    lstr = lstr_dataview.subview()
    k1 = (p1 + p2) << 2
    k2 = (p1 + p3) << 2
    xk = (k1 + k2) & 0xffff
    n = ReadUint16(lstr) // 2
    decwords = b''
    for _ in range(n):
        shift = p2 % 8
        ch = ReadUint16(lstr)
        # print(ch)
        dch = (ch << (16 - (shift % 8)) | (ch >> shift)) & 0xffff
        dch ^= xk
        decwords += struct.pack('<H', dch)
    dec_lstr = LString()
    dec_lstr.size = n * 2
    dec_lstr.data = decwords
    dec_lstr.string = decwords.decode('utf-16')
    return dec_lstr


class DataView(object):
    def __init__(self, buff, pos=0):
        self.buff = buff
        self.pos = pos

    def read(self, n):
        assert n >= 0
        end = self.pos + n
        assert end <= len(self.buff)
        data = self.buff[self.pos: end]
        self.pos = end
        return data

    def len(self):
        return len(self.buff) - self.pos

    def subview(self, off=0):
        return DataView(self.buff, self.pos + off)

    def offset_of(self, base):
        assert base.buff == self.buff
        return self.pos - base.pos


def ReadInt32(b):
    return struct.unpack('<i', b.read(4))[0]


def ReadUint32(b):
    return struct.unpack('<I', b.read(4))[0]


def ReadUint16(b):
    return struct.unpack('<H', b.read(2))[0]


if __name__ == '__main__':
    in_path = sys.argv[1]
    out_path = sys.argv[2]

    with open(in_path, 'rb') as fin:
        filedata = fin.read()
    size = len(filedata)
    f = DataView(filedata)

    # File header
    file_chksum = ReadUint32(f)
    uint_4 = ReadUint32(f)
    uint_8 = ReadUint32(f)
    uint_12 = ReadUint32(f)
    uint_16 = ReadUint32(f)

    print('uint0-16:', file_chksum, uint_4, uint_8, uint_12, uint_16)
    config_size = uint_4
    chksum = uint_4 + uint_8 + uint_12 + uint_16

    assert 0 <= uint_4 <= size

    f2 = DataView(filedata, uint_4 + 8)
    f_s8 = DataView(filedata, 20)
    pos_2 = uint_4 + 8

    key_items = []
    if uint_8 > 0:
        # Parse config
        for i in range(uint_8):
            key = KeyItem()
            key.dict_typedef = ReadUint16(f_s8)
            assert key.dict_typedef < 100
            num_datatype = ReadUint16(f_s8)
            if num_datatype > 0:
                for _ in range(num_datatype):
                    datatype = ReadUint16(f_s8)
                    key.datatype.append(datatype)
            key.attr_idx = ReadUint32(f_s8)
            key.key_data_idx = ReadUint32(f_s8)
            key.data_idx = ReadUint32(f_s8)
            key.v6 = ReadUint32(f_s8)
            # ??? key.dict_typedef = ReadUint32(f_s8)
            key_items.append(key)

    attr_items = []
    if uint_12 > 0:
        for _ in range(uint_12):
            attr = AttributeItem()
            attr.count = ReadUint32(f_s8)
            attr.a2 = ReadUint32(f_s8)
            attr.data_id = ReadUint32(f_s8)
            attr.b2 = ReadUint32(f_s8)
            attr_items.append(attr)

    aint_items = []
    if uint_16 > 0:
        for _ in range(uint_16):
            aint = ReadUint32(f_s8)
            aint_items.append(aint)

    assert f_s8.pos == f2.pos  # all the sec8 data has been processed

    usrdict = BaseDict()
    usrdict.key = key_items
    usrdict.attr = attr_items
    usrdict.aint = aint_items
    usrdict.init()

    header_size = 12 * (len(usrdict.attr) + len(usrdict.aint) + len(usrdict.key)) + 24

    b2_version = ReadUint32(f2)
    b2_format = ReadUint32(f2)
    print(f'version:{b2_version} format:{b2_format}')

    total_size = ReadUint32(f2)
    USR_DICT_HEADER_SIZE = 4 + 76
    assert total_size > 0 and total_size + header_size + config_size + 8 == size - USR_DICT_HEADER_SIZE  # assert buff2.1

    size3_b2 = ReadUint32(f2)
    size4_b2 = ReadUint32(f2)
    size5_b2 = ReadUint32(f2)
    print('header size:', total_size, size3_b2, size4_b2, size5_b2)

    header_items_index = []
    for _ in range(size3_b2):
        header = HeaderItem()
        header.parse(f2)
        chksum += header.offset + header.datasize + header.used_datasize
        header_items_index.append(header)
    usrdict.header_index = header_items_index

    header_items_attr = []
    for _ in range(size4_b2):
        header = HeaderItem()
        header.parse(f2)
        chksum += header.offset + header.datasize + header.used_datasize
        header_items_attr.append(header)
    usrdict.header_attr = header_items_attr

    datastore_items = []
    for _ in range(size5_b2):
        header = HeaderItem()
        header.parse(f2)
        chksum += header.offset + header.datasize + header.used_datasize
        datastore_items.append(header)
    usrdict.datastore = datastore_items

    usrdict.ds_base = f2
    assert pos_2 + header_size == f2.pos

    # User Header
    f_usr = DataView(filedata, size - 0x4c)
    usr_header = UserHeader()
    usr_header.parse(f_usr)

    # Read all words
    fout = open(out_path, 'w')
    all_data = usrdict.GetAllDataWithAttri(0)
    for attr, attr2 in all_data:
        py = usrdict.GetPys(ReadUint32(attr.subview()))
        pys = DecryptPinyin(py)
        word_info = AttrWordData()
        word_info.parse(attr2.subview())
        # GetWordData
        attr_id = usrdict.key[0].attr_idx
        data_id = usrdict.GetDataIdByAttriId(attr_id)
        word_base = usrdict.GetData(data_id, word_info.offset)
        # DecryptWordsEx
        word = DecryptWordsEx(word_base, word_info.p1, usr_header.p2, usr_header.p3)
        fout.write(f'{word.string}\t{word_info.freq}\t{pys}\n')
        fout.flush()
    fout.close()
